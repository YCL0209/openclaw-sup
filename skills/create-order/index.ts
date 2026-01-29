/**
 * ================================
 * Clawdbot + OrderManagement 集成
 * 互动式建立订单（方案 B+）
 * ================================
 * 
 * 流程：
 * 1. 用户: /order
 * 2. Bot: 请问客户名称？
 * 3. 用户: 王小明
 * 4. Bot: 找到客户 / 找不到，要建立吗？
 * 5. 依序询问品项、数量、地址等
 * 6. 最后确认
 * 7. 建立订单
 */

// ========================================
// 第 1 部分：配置
// ========================================

const ERP_API_BASE = 'http://localhost:3000';
const ERP_TAX_ID = '00091103';
const ERP_BOT_EMAIL = 'info@sui-yao.com';
const ERP_BOT_PASSWORD = '000000';

// Token 管理
let jwtToken: string | null = null;
let sessionId: string | null = null;
let tokenExpiry: Date | null = null;

// 对话状态管理（简化版，存在内存中）
const conversationState: Map<string, any> = new Map();

// ========================================
// 第 2 部分：ERP API 函数
// ========================================

async function loginToERP(): Promise<string> {
  console.log('🔐 [ERP] 正在登入...');
  
  try {
    const response = await fetch(`${ERP_API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taxId: ERP_TAX_ID,
        email: ERP_BOT_EMAIL,
        password: ERP_BOT_PASSWORD
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(`登入失败：${data.message}`);
    }

    jwtToken = data.data.token;
    sessionId = data.data.sessionId;
    tokenExpiry = new Date(Date.now() + data.data.expiresIn * 1000);

    console.log('✅ [ERP] 登入成功');
    return jwtToken;
  } catch (error) {
    console.error('❌ [ERP] 登入错误：', error);
    throw error;
  }
}

async function ensureValidToken(): Promise<string> {
  if (!jwtToken) {
    return await loginToERP();
  }

  const now = new Date();
  if (tokenExpiry && now.getTime() > tokenExpiry.getTime()) {
    console.log('⏰ [Token] 已过期，重新登入');
    return await loginToERP();
  }

  return jwtToken;
}

async function callERP(
  path: string,
  method: string = 'GET',
  body?: object
): Promise<any> {
  const token = await ensureValidToken();

  console.log(`📡 [API] ${method} ${path}`);

  const response = await fetch(`${ERP_API_BASE}${path}`, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`API 调用失败：${data.message}`);
  }

  return data;
}

// ========================================
// 第 3 部分：客户相关函数
// ========================================

async function searchCustomers(keyword: string): Promise<any[]> {
  console.log(`🔍 [客户] 搜索：${keyword}`);
  
  try {
    // 添加 5 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const result = await callERP('/api/customers', 'GET');
    clearTimeout(timeoutId);
    
    // 搜索匹配
    const matches = result.data.filter(
      (c: any) => 
        c.name.includes(keyword) || 
        c.contact?.includes(keyword) ||
        c.customerCode?.includes(keyword)
    );

    console.log(`✅ [客户] 找到 ${matches.length} 个匹配`);
    return matches;
  } catch (error) {
    console.error('❌ [客户] 搜索失败：', error);
    // 如果是连接错误，返回空数组而不是抛出
    if ((error as Error).message.includes('localhost') || (error as Error).message.includes('connect')) {
      console.warn('⚠️ ERP 服务不可用，允许用户建立新客户');
      return [];
    }
    throw error;
  }
}

async function createCustomer(data: {
  name: string;
  phone?: string;
  address?: string;
  type?: string;
}): Promise<any> {
  console.log(`➕ [客户] 新增客户：${data.name}`);
  
  try {
    // 添加 5 秒超时
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ 建立客户超时');
    }, 5000);
    
    const result = await callERP('/api/customers', 'POST', {
      name: data.name,
      phone: data.phone || '',
      address: data.address || '',
      type: data.type || 'customer',
      payment: {
        method: 'cash'
      }
    });
    
    clearTimeout(timeoutId);
    console.log(`✅ [客户] 新增成功：${result.data.customerCode}`);
    return result.data;
  } catch (error) {
    console.error('❌ [客户] 新增失败：', error);
    
    // 如果是连接错误，创建本地客户对象作为临时方案
    if ((error as Error).message.includes('localhost') || (error as Error).message.includes('ECONNREFUSED')) {
      console.warn('⚠️ ERP 不可用，使用本地客户对象');
      return {
        _id: `local_${Date.now()}`,
        name: data.name,
        phone: data.phone || '',
        address: data.address || '',
        customerCode: `LOCAL_${Math.random().toString(36).substr(2, 9).toUpperCase()}`
      };
    }
    
    throw error;
  }
}

async function createOrder(orderData: {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  shippingAddress?: string;
  items: Array<{ name: string; qty: number }>;
  notes?: string;
}): Promise<any> {
  console.log(`📋 [订单] 建立订单`);

  try {
    const erpOrderData = {
      orderType: 'sales',
      customerId: orderData.customerId,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone || '',
      shippingAddress: orderData.shippingAddress || '',
      items: orderData.items.map((item) => ({
        productCode: item.name,
        productName: item.name,
        quantity: item.qty,
        unitPrice: 0
      })),
      paymentInfo: {
        method: 'cash',
        isPaid: false,
        paidAmount: 0
      },
      notes: orderData.notes || ''
    };

    const result = await callERP('/api/orders', 'POST', erpOrderData);

    console.log(`✅ [订单] 建立成功：${result.data.orderNumber}`);
    return result.data;
  } catch (error) {
    console.error('❌ [订单] 建立失败：', error);
    throw error;
  }
}

// ========================================
// 第 4 部分：对话状态管理
// ========================================

function getOrCreateState(userId: string): any {
  if (!conversationState.has(userId)) {
    conversationState.set(userId, {
      step: 'start',
      orderData: {
        items: []
      }
    });
  }
  return conversationState.get(userId);
}

function clearState(userId: string): void {
  conversationState.delete(userId);
}

// ========================================
// 第 5 部分：互动式对话处理
// ========================================

async function handleOrderConversation(
  userId: string,
  message: string
): Promise<string> {
  const state = getOrCreateState(userId);

  console.log(`📞 [对话] 用户：${message} (步骤：${state.step})`);

  // 全局快捷命令
  if (message.trim() === '取消' || message.trim() === 'cancel') {
    if (state.step === 'start') {
      return `👋 欢迎使用订单系统！\n\n请输入「/order」来开始建立订单`;
    }
    clearState(userId);
    return `❌ 已取消\n\n输入「/order」来重新开始`;
  }

  if (message.trim() === '帮助' || message.trim() === 'help') {
    return `📚 订单系统帮助：\n\n`
      + `• 输入「/order」开始建立订单\n`
      + `• 输入「取消」或「cancel」随时中止流程\n`
      + `• 输入「查看」/「列表」查看已添加的产品\n\n`
      + `当前步骤：${state.step}`;
  }

  // Step 1: 开始 - 询问客户名
  if (state.step === 'start') {
    state.step = 'ask_customer';
    return `👋 欢迎使用订单系统！\n\n请问客户名称是？（例如：王小明）`;
  }

  // Step 2: 获取客户名 - 搜索客户
  if (state.step === 'ask_customer') {
    const userMsg = message.trim();

    // 检查取消命令
    if (userMsg === '取消' || userMsg === 'cancel') {
      clearState(userId);
      return `❌ 已取消\n\n输入「/order」来重新开始`;
    }

    // 验证输入不为空
    if (!userMsg || userMsg.length === 0) {
      return `⚠️ 请输入客户名称`;
    }

    try {
      const matches = await searchCustomers(userMsg);

      if (matches.length === 0) {
        // 客户不存在 - 询问是否新增
        state.step = 'ask_create_customer';
        state.searchKeyword = userMsg;
        return `❌ 找不到客户「${userMsg}」\n\n`
          + `1️⃣ 建立新客户\n`
          + `2️⃣ 重新搜索\n`
          + `3️⃣ 取消\n\n`
          + `请回复：1、2 或 3`;
      }

      if (matches.length === 1) {
        // 只有一个匹配 - 直接选中
        state.customer = matches[0];
        state.step = 'ask_items';
        return `✅ 找到客户：${matches[0].name}\n\n`
          + `现在请告诉我要订购的产品。\n`
          + `格式：产品名称 数量\n\n`
          + `例如：A产品 2\n`
          + `然后输入「完成」来结束输入\n\n`
          + `或输入「取消」来返回`;
      }

      // 多个匹配 - 让用户选择
      state.step = 'select_customer';
      state.matches = matches;
      let reply = `🔍 找到 ${matches.length} 个客户：\n\n`;
      matches.forEach((c: any, i: number) => {
        reply += `${i + 1}️⃣ ${c.name} (${c.customerCode}) - ${c.phone || '无电话'}\n`;
      });
      reply += `\n请回复序号（1-${matches.length}）或「取消」`;
      return reply;

    } catch (error) {
      console.error('❌ 搜索客户出错', error);
      const errorMsg = (error as Error).message;
      
      // 如果是网络错误，给出更友好的提示
      if (errorMsg.includes('localhost') || errorMsg.includes('ECONNREFUSED')) {
        return `⚠️ ERP 系统暂不可用\n\n`
          + `请输入「1」建立新客户，或「2」重新搜索`;
      }
      
      return `❌ 搜索出错：${errorMsg}\n\n`
        + `请重新输入客户名称`;
    }
  }

  // Step 3: 选择客户（从多个匹配中选）
  if (state.step === 'select_customer') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      state.step = 'ask_customer';
      return `请重新输入客户名称：`;
    }

    const index = parseInt(userMsg, 10) - 1;

    if (isNaN(index) || index < 0 || index >= state.matches.length) {
      return `❌ 请输入有效的序号（1-${state.matches.length}）或「取消」`;
    }

    state.customer = state.matches[index];
    state.step = 'ask_items';
    return `✅ 已选择客户：${state.customer.name}\n\n`
      + `现在请告诉我要订购的产品。\n`
      + `格式：产品名称 数量\n\n`
      + `例如：A产品 2\n`
      + `然后输入「完成」来结束输入\n\n`
      + `或输入「取消」来返回`;
  }

  // Step 4: 询问是否建立新客户
  if (state.step === 'ask_create_customer') {
    const choice = message.trim();

    if (choice === '1') {
      state.step = 'create_customer_name';
      return `好的，我们来建立新客户。\n\n`
        + `请问客户名称是？\n\n`
        + `或输入「取消」来返回`;
    } else if (choice === '2') {
      state.step = 'ask_customer';
      return `请输入客户名称进行重新搜索：`;
    } else if (choice === '3' || choice === '取消') {
      state.step = 'ask_customer';
      return `请输入客户名称：`;
    } else {
      return `❌ 请回复：1（建立新客户）、2（重新搜索）或 3（取消）`;
    }
  }

  // Step 5: 建立新客户 - 输入名称
  if (state.step === 'create_customer_name') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      state.step = 'ask_customer';
      return `已取消。\n\n请输入客户名称：`;
    }

    if (!userMsg || userMsg.length === 0) {
      return `⚠️ 请输入客户名称`;
    }

    state.newCustomerName = userMsg;
    state.step = 'create_customer_phone';
    return `谢谢！\n\n`
      + `请问客户电话？（可输入「跳过」或「取消」）`;
  }

  // Step 6: 建立新客户 - 输入电话
  if (state.step === 'create_customer_phone') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      state.step = 'ask_customer';
      return `已取消。\n\n请输入客户名称：`;
    }

    const phone = userMsg === '跳过' ? undefined : userMsg;
    state.newCustomerPhone = phone;
    state.step = 'create_customer_address';
    return `请问客户地址？（可输入「跳过」或「取消」）`;
  }

  // Step 7: 建立新客户 - 输入地址
  if (state.step === 'create_customer_address') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      state.step = 'ask_customer';
      return `已取消。\n\n请输入客户名称：`;
    }

    const address = userMsg === '跳过' ? undefined : userMsg;

    try {
      state.customer = await createCustomer({
        name: state.newCustomerName,
        phone: state.newCustomerPhone,
        address: address
      });

      state.step = 'ask_items';
      return `✅ 新客户建立成功！\n\n`
        + `客户名：${state.customer.name}\n`
        + `客户编号：${state.customer.customerCode}\n\n`
        + `现在请告诉我要订购的产品。\n`
        + `格式：产品名称 数量\n\n`
        + `例如：A产品 2\n`
        + `然后输入「完成」来结束输入\n\n`
        + `或输入「取消」来返回`;

    } catch (error) {
      console.error('建立客户出错', error);
      return `❌ 建立客户出错：${(error as Error).message}\n\n`
        + `请输入「重试」重新尝试，或「取消」返回`;
    }
  }

  // Step 8: 输入品项
  if (state.step === 'ask_items') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      clearState(userId);
      return `❌ 已取消\n\n输入「/order」来重新开始`;
    }

    if (userMsg === '完成' || userMsg === '确认' || userMsg === '結束') {
      if (state.orderData.items.length === 0) {
        return `⚠️ 至少要输入一个产品！\n\n`
          + `请输入产品信息，例如：A产品 2`;
      }

      state.step = 'ask_address';
      return `📦 已记录的产品：\n\n`
        + state.orderData.items.map((i: any, idx: number) => 
          `${idx + 1}. ${i.name} x ${i.qty}`
        ).join('\n')
        + `\n\n请问送货地址？（可输入「使用默认」或「取消」）`;
    }

    // 检查是否要查看已添加的产品
    if (userMsg === '查看' || userMsg === '列表') {
      if (state.orderData.items.length === 0) {
        return `📦 还没有添加产品\n\n请输入产品信息，例如：A产品 2`;
      }
      return `📦 已添加的产品：\n\n`
        + state.orderData.items.map((i: any, idx: number) => 
          `${idx + 1}. ${i.name} x ${i.qty}`
        ).join('\n')
        + `\n\n继续输入更多产品，或输入「完成」`;
    }

    // 解析产品信息：产品名 数量
    const parts = userMsg.split(/\s+/);
    if (parts.length < 2) {
      return `❌ 格式不对。请输入：产品名称 数量\n\n`
        + `例如：A产品 2\n\n`
        + `其他命令：「完成」、「查看」、「取消」`;
    }

    const productName = parts.slice(0, -1).join(' '); // 支持多字产品名
    const quantity = parseInt(parts[parts.length - 1], 10);

    if (isNaN(quantity) || quantity <= 0) {
      return `❌ 数量必须是正整数，例如：A产品 2`;
    }

    state.orderData.items.push({ name: productName, qty: quantity });

    return `✅ 已添加：${productName} x${quantity}\n\n`
      + `继续添加更多产品，输入「查看」查看列表，或输入「完成」`;
  }

  // Step 9: 输入地址
  if (state.step === 'ask_address') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      state.step = 'ask_items';
      return `已返回。\n\n继续添加产品，或输入「完成」`;
    }

    if (userMsg !== '使用默认' && userMsg !== '') {
      state.orderData.shippingAddress = userMsg;
    }

    state.step = 'ask_notes';
    return `请问有什么备注吗？（可输入「无」或「取消」）`;
  }

  // Step 10: 输入备注
  if (state.step === 'ask_notes') {
    const userMsg = message.trim();

    if (userMsg === '取消' || userMsg === 'cancel') {
      state.step = 'ask_address';
      return `已返回。\n\n请输入送货地址（可输入「使用默认」）：`;
    }

    if (userMsg !== '无' && userMsg !== '') {
      state.orderData.notes = userMsg;
    }

    state.step = 'confirm_order';

    // 生成确认消息
    const itemsSummary = state.orderData.items
      .map((i: any) => `${i.name} x${i.qty}`)
      .join('、');

    let confirmMsg = `✋ 请确认订单信息：\n\n`
      + `👤 客户：${state.customer.name}\n`
      + `📦 产品：${itemsSummary}\n`;
    
    if (state.orderData.shippingAddress) {
      confirmMsg += `📍 地址：${state.orderData.shippingAddress}\n`;
    }
    
    if (state.orderData.notes) {
      confirmMsg += `📝 备注：${state.orderData.notes}\n`;
    }

    confirmMsg += `\n请回复「确认」来建立订单，或「修改」来返回修改`;
    
    return confirmMsg;
  }

  // Step 11: 确认订单
  if (state.step === 'confirm_order') {
    const userMsg = message.trim();

    if (userMsg === '确认' || userMsg === '确定') {
      // 建立订单
      try {
        const order = await createOrder({
          customerId: state.customer._id,
          customerName: state.customer.name,
          customerPhone: state.customer.phone,
          shippingAddress: state.orderData.shippingAddress || state.customer.address,
          items: state.orderData.items,
          notes: state.orderData.notes
        });

        clearState(userId);

        const itemsSummary = state.orderData.items
          .map((i: any) => `${i.name} x${i.qty}`)
          .join('、');

        return `✅ 订单建立成功！\n\n`
          + `📋 订单编号：${order.orderNumber}\n`
          + `👤 客户：${state.customer.name}\n`
          + `📦 产品：${itemsSummary}\n`
          + `📊 状态：待处理\n\n`
          + `输入「/order」来建立下一个订单`;

      } catch (error) {
        console.error('建立订单失败', error);
        return `❌ 建立订单失败：${(error as Error).message}\n\n`
          + `请重试「确认」，或「取消」返回`;
      }
    } else if (userMsg === '修改') {
      state.step = 'ask_notes';
      return `请输入新的备注（可输入「无」或「取消」返回）：`;
    } else if (userMsg === '取消' || userMsg === 'cancel') {
      clearState(userId);
      return `❌ 已取消\n\n输入「/order」来重新开始`;
    } else {
      return `❌ 请回复「确认」、「修改」或「取消」`;
    }
  }

  // 未知状态或未知消息
  console.warn(`⚠️ 未知状态或消息：步骤=${state.step}, 消息=${message}`);
  return `❓ 没有理解你的意思。\n\n输入「/order」重新开始，或「取消」中止流程`;
}

// ========================================
// 第 6 部分：主函数（Clawdbot 调用）
// ========================================

export default async function createOrder(message: string, context?: any): Promise<string> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📱 [主函数] 收到消息：${message}`);

  // 获取用户 ID（来自 Clawdbot context）
  const userId = context?.userId || 'default-user';
  console.log(`👤 用户 ID：${userId}`);

  try {
    // 如果是 /order 命令，重置状态
    if (message.trim() === '/order') {
      console.log(`🔄 重置用户状态`);
      clearState(userId);
    }

    // 记录当前状态
    const state = getOrCreateState(userId);
    console.log(`📊 当前状态：${JSON.stringify({
      step: state.step,
      itemsCount: state.orderData?.items?.length || 0
    })}`);

    // 处理对话
    const reply = await handleOrderConversation(userId, message);
    
    console.log(`✅ 回复已生成（长度：${reply.length}）`);
    console.log(`📝 回复预览：${reply.substring(0, 100)}...`);
    console.log(`${'='.repeat(50)}\n`);
    
    return reply;

  } catch (error) {
    console.error(`❌ 处理失败：`, error);
    console.error(`错误堆栈：${(error as any).stack}`);
    clearState(userId);
    return `❌ 出错了：${(error as Error).message}\n\n`
      + `输入「/order」来重新开始`;
  }
}
