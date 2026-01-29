/**
 * ================================
 * system-router - 系统意图路由器
 * ================================
 * 
 * 功能：
 * 1. 检测用户消息中的系统意图（关键词）
 * 2. 如果检测到，询问用户确认
 * 3. 用户确认后，调用对应的 skill
 * 4. 如果用户拒绝或无关键词，进行普通对话
 */

// 意图关键词映射
const intentMap = {
  order: {
    keywords: /建立订单|下单|订购|采购|建立一个订单|要订购|我要订|创建订单/gi,
    skillName: 'create-order',
    prompt: '您是否需要建立订单？'
  }
  // 未来扩展：
  // inventory: {
  //   keywords: /查库存|有货吗|库存查询/gi,
  //   skillName: 'inventory-query',
  //   prompt: '您是否需要查询库存？'
  // }
};

// 用户状态管理（跟踪用户是否在某个 skill 流程中）
const userState = new Map();

function getUserState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, {
      intentType: null,
      inSkillFlow: false,
      skillName: null
    });
  }
  return userState.get(userId);
}

function clearUserState(userId) {
  userState.delete(userId);
}

/**
 * 检测用户消息中的意图
 * @param {string} message 用户消息
 * @returns {string|null} 意图类型 ('order', 'inventory', 等) 或 null
 */
function detectIntent(message) {
  for (const [intentType, config] of Object.entries(intentMap)) {
    if (config.keywords.test(message)) {
      console.log(`✅ [路由器] 检测到意图：${intentType}`);
      return intentType;
    }
  }
  console.log(`ℹ️ [路由器] 无意图匹配，进行普通对话`);
  return null;
}

/**
 * 动态导入并调用 skill
 * @param {string} skillName skill 名称
 * @param {string} message 用户消息
 * @param {object} context 上下文
 * @returns {Promise<string>} skill 返回的结果
 */
async function callSkill(skillName, message, context) {
  try {
    console.log(`\n📡 [路由器] 调用 skill：${skillName}`);

    // 动态导入 skill
    const skillPath = `../` + skillName + `/index.js`;
    const skillModule = await import(skillPath);
    const skillFn = skillModule.default;

    if (!skillFn) {
      throw new Error(`Skill ${skillName} 没有默认导出`);
    }

    // 调用 skill，传入用户消息和上下文
    const result = await skillFn(message, context);

    console.log(`✅ [路由器] skill 返回结果`);
    return result;

  } catch (error) {
    console.error(`❌ [路由器] 调用 skill 失败：${error.message}`);
    throw error;
  }
}

/**
 * 主路由逻辑
 */
async function handleRouting(userId, message, context) {
  const state = getUserState(userId);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📨 [路由器] 收到消息：${message}`);
  console.log(`👤 用户 ID：${userId}`);
  console.log(`📊 用户状态：${JSON.stringify(state)}`);

  // 如果用户已在 skill 流程中，直接继续该流程
  if (state.inSkillFlow && state.skillName) {
    console.log(`🔄 [路由器] 继续 skill 流程：${state.skillName}`);
    try {
      const result = await callSkill(state.skillName, message, context);

      // 检查 skill 是否完成（简单启发式）
      // 如果 skill 返回"已取消"或"建立成功"，清除状态
      if (result.includes('已取消') || result.includes('建立成功')) {
        clearUserState(userId);
        console.log(`✅ [路由器] Skill 流程完成，清除状态`);
      }

      return result;
    } catch (error) {
      console.error(`❌ [路由器] Skill 执行错误：${error.message}`);
      clearUserState(userId);
      return `❌ 订单流程出错：${error.message}\n\n输入「/order」重新开始`;
    }
  }

  // 检测新的意图
  const intent = detectIntent(message);

  if (!intent) {
    // 没有检测到意图 → 普通对话，继续
    console.log(`ℹ️ [路由器] 进行普通对话（无意图）`);
    return null; // 返回 null 表示继续普通 AI 对话
  }

  // 检测到意图 → 询问确认
  const config = intentMap[intent];
  console.log(`❓ [路由器] 询问用户确认`);

  return `${config.prompt}\n\n请回复「是」/「好的」来确认，或继续聊天。`;
}

/**
 * 处理用户的确认回复
 */
function handleConfirmation(userId, message, intentType) {
  const confirmKeywords = /是|好|确认|可以|同意|yes|ok|好的|都可以/gi;

  if (confirmKeywords.test(message)) {
    // 用户确认 → 标记进入 skill 流程
    const state = getUserState(userId);
    const config = intentMap[intentType];

    state.intentType = intentType;
    state.inSkillFlow = true;
    state.skillName = config.skillName;

    console.log(`✅ [路由器] 用户确认，进入 skill 流程：${config.skillName}`);

    return {
      confirmed: true,
      skillName: config.skillName
    };
  } else {
    // 用户拒绝 → 继续普通对话
    console.log(`ℹ️ [路由器] 用户拒绝，继续普通对话`);
    return {
      confirmed: false
    };
  }
}

/**
 * 主函数 - Clawdbot 调用入口
 */
export default async function systemRouter(message, context) {
  const userId = context?.userId || 'default-user';

  try {
    // 第一步：检测意图和处理
    const routeResult = await handleRouting(userId, message, context);

    // 如果检测到意图，返回确认提示
    if (routeResult && routeResult !== null) {
      // 这是一个确认提示，需要等用户回复
      // 下一条消息会进入这个逻辑

      // 但我们需要记录这个"待确认"状态，以便下一条消息来时判断
      const state = getUserState(userId);
      const intent = detectIntent(message);
      
      if (intent && !state.inSkillFlow) {
        // 记录正在等待确认
        state.awaitingConfirmation = true;
        state.pendingIntent = intent;
      }

      console.log(`${'='.repeat(50)}\n`);
      return routeResult;
    }

    // 第二步：检查是否等待确认
    const state = getUserState(userId);
    if (state.awaitingConfirmation && state.pendingIntent) {
      const confirmation = handleConfirmation(userId, message, state.pendingIntent);
      state.awaitingConfirmation = false;

      if (confirmation.confirmed) {
        // 用户确认 → 调用 skill
        try {
          const skillResult = await callSkill(confirmation.skillName, message, context);
          console.log(`${'='.repeat(50)}\n`);
          return skillResult;
        } catch (error) {
          console.error(`❌ [路由器] Skill 调用失败：${error.message}`);
          clearUserState(userId);
          console.log(`${'='.repeat(50)}\n`);
          return `❌ 启动订单系统失败：${error.message}\n\n请稍后重试`;
        }
      } else {
        // 用户拒绝 → 继续普通对话
        console.log(`${'='.repeat(50)}\n`);
        return null; // 继续普通对话
      }
    }

    // 第三步：如果没有任何意图匹配，进行普通对话
    console.log(`${'='.repeat(50)}\n`);
    return null; // 返回 null 表示继续普通 AI 对话

  } catch (error) {
    console.error(`❌ [路由器] 处理失败：${error.message}`);
    console.error(`错误堆栈：${error.stack}`);
    clearUserState(userId);
    console.log(`${'='.repeat(50)}\n`);
    return `❌ 路由器出错：${error.message}`;
  }
}
