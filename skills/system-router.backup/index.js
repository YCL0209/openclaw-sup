/**
 * ================================
 * system-router - Plugin Hook 版本
 * ================================
 * 
 * 作為 Clawdbot Plugin Hook 運行
 * Hook: before_agent_start
 * 功能：檢測訊息中的訂單意圖關鍵詞，直接調用 create-order skill
 */

// 意圖關鍵詞映射
const intentMap = {
  order: {
    keywords: /建立訂單|下單|訂購|採購|建立一個訂單|要訂購|我要訂|創建訂單|下訂單/gi,
    skillName: 'create-order'
  }
};

/**
 * 檢測用戶訊息中的意圖
 */
function detectIntent(message) {
  for (const [intentType, config] of Object.entries(intentMap)) {
    if (config.keywords.test(message)) {
      console.log(`✅ [system-router] 檢測到意圖：${intentType}`);
      return intentType;
    }
  }
  return null;
}

/**
 * Plugin Hook: before_agent_start
 * 在 Agent 啟動前執行，可以檢測和攔截訊息
 */
export default async function systemRouterHook(event) {
  try {
    if (!event || event.type !== 'agent' || event.phase !== 'start') {
      return;
    }

    const messages = event.messages || [];
    if (messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const messageContent = lastMessage?.content || '';
    const userId = event.context?.userId || event.context?.channelUserId || 'default-user';

    console.log(`\n[system-router] 檢查訊息: "${messageContent}"`);

    const intent = detectIntent(messageContent);

    if (!intent) {
      console.log(`[system-router] 無意圖匹配，繼續正常對話`);
      return;
    }

    console.log(`[system-router] ✅ 檢測到訂單意圖，標記為直接調用 create-order`);

    lastMessage.skipAgent = true;
    lastMessage.routeToSkill = 'create-order';
    lastMessage.routeUserId = userId;

  } catch (error) {
    console.error(`[system-router] Hook 處理失敗: ${error.message}`);
  }
}
