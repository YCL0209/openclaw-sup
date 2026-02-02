/**
 * Generate PDF Skill for Clawdbot + ERP Integration
 * 
 * Generate PDF documents (quotation/purchase/sales) from existing orders
 * and convert them to images for LINE delivery.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ========================================
// Configuration
// ========================================

const ERP_API_BASE = process.env.ERP_API_URL || 'http://localhost:3000';
const ERP_TAX_ID = process.env.ERP_TAX_ID || '00091103';
const ERP_BOT_EMAIL = process.env.ERP_BOT_EMAIL || 'info@sui-yao.com';
const ERP_BOT_PASSWORD = process.env.ERP_BOT_PASSWORD || '000000';

// OpenClaw Gateway Configuration
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

// ========================================
// Token Management
// ========================================

let jwtToken = null;
let sessionId = null;
let tokenExpiry = 0;

async function ensureAuthenticated() {
  const now = Date.now();
  
  if (jwtToken && now < tokenExpiry - 60000) {
    return jwtToken;
  }

  if (sessionId && jwtToken) {
    try {
      const res = await fetch(`${ERP_API_BASE}/api/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ sessionId })
      });
      
      const data = await res.json();
      if (data.success) {
        jwtToken = data.data.token;
        tokenExpiry = now + (data.data.expiresIn * 1000);
        console.log('[PDF] Token refreshed successfully');
        return jwtToken;
      }
    } catch (e) {
      console.warn('[PDF] Token refresh failed, re-authenticating...', e.message);
    }
  }

  console.log('[PDF] Authenticating as bot account...');
  const res = await fetch(`${ERP_API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taxId: ERP_TAX_ID,
      email: ERP_BOT_EMAIL,
      password: ERP_BOT_PASSWORD
    })
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(`ERP authentication failed: ${data.message}`);
  }

  jwtToken = data.data.token;
  sessionId = data.data.sessionId;
  tokenExpiry = now + (data.data.expiresIn * 1000);
  
  console.log('[PDF] Authenticated successfully');
  return jwtToken;
}

async function erpFetch(path, options = {}) {
  const token = await ensureAuthenticated();
  
  const url = `${ERP_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('[PDF] API error:', response.status, data);
  }

  return data;
}

// ========================================
// OpenClaw Message Integration
// ========================================

/**
 * 發送圖片到 LINE 用戶
 * 直接調用 OpenClaw Gateway 的 message API
 */
async function sendImageToLineUser(imageUrl, userId, caption, channel = 'line') {
  try {
    console.log(`[PDF] Sending image to user ${userId}: ${imageUrl}`);
    
    const response = await fetch(`${OPENCLAW_GATEWAY_URL}/api/v1/message/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_GATEWAY_TOKEN}`
      },
      body: JSON.stringify({
        channel: channel,
        to: userId,
        mediaUrl: imageUrl,
        caption: caption
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PDF] Failed to send image: ${response.status} ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`[PDF] Image sent successfully:`, result);
    return true;

  } catch (error) {
    console.error(`[PDF] Error sending image:`, error.message);
    return false;
  }
}

// ========================================
// Main Function
// ========================================

/**
 * Main entry point for generate-pdf skill
 */
async function generatePDF(message, context) {
  try {
    console.log('[PDF] Processing message:', message);

    // Check if this is a follow-up (waiting for type selection)
    const state = context.conversationState || {};
    
    if (state.waitingForPdfType) {
      return handleTypeSelection(message, state, context);
    }

    // Parse order number and document type from message
    const parsed = parseMessage(message);
    
    if (!parsed.orderNumber) {
      return '請提供訂單編號。\n格式：生成報價單 ORD-260123-SA7M';
    }

    console.log('[PDF] Parsed:', JSON.stringify(parsed, null, 2));

    // Query order from ERP
    console.log('[PDF] Querying order:', parsed.orderNumber);
    const ordersData = await erpFetch(`/api/orders?orderNumber=${parsed.orderNumber}`);
    
    if (!ordersData.success || !ordersData.data || ordersData.data.length === 0) {
      return `找不到訂單「${parsed.orderNumber}」\n請確認訂單編號是否正確。`;
    }

    const order = ordersData.data[0];
    const orderId = order._id;

    console.log('[PDF] Found order:', orderId);

    // If type not specified, ask user
    if (!parsed.type) {
      context.conversationState = {
        ...state,
        waitingForPdfType: true,
        orderId: orderId,
        orderNumber: parsed.orderNumber,
        order: order
      };

      return `✅ 找到訂單 ${parsed.orderNumber}\n`
        + `━━━━━━━━━━━━━━━━\n`
        + `👤 客戶：${order.customerName}\n`
        + `💰 總額：NT$ ${order.totalAmount.toLocaleString()}\n`
        + `\n請選擇單據類型：\n`
        + `1️⃣ 報價單 (quotation)\n`
        + `2️⃣ 採購單 (purchase)\n`
        + `3️⃣ 銷貨單 (sales)\n`
        + `\n請回覆數字 1-3`;
    }

    // Generate PDF
    return await generateAndSendPDF(orderId, parsed.orderNumber, parsed.type, order, context);

  } catch (error) {
    console.error('[PDF] Error:', error);
    return `系統錯誤：${error.message}\n請稍後再試。`;
  }
}

/**
 * Parse message to extract order number and document type
 */
function parseMessage(message) {
  const result = {
    orderNumber: null,
    type: null
  };

  // Extract order number (format: ORD-YYMMDD-XXXX)
  const orderMatch = message.match(/ORD-\d{6}-[A-Z0-9]{4}/i);
  if (orderMatch) {
    result.orderNumber = orderMatch[0].toUpperCase();
  }

  // Detect document type
  if (message.includes('報價單') || message.includes('quotation')) {
    result.type = 'quotation';
  } else if (message.includes('採購單') || message.includes('purchase')) {
    result.type = 'purchase';
  } else if (message.includes('銷貨單') || message.includes('sales')) {
    result.type = 'sales';
  }

  return result;
}

/**
 * Handle user selection of document type
 */
async function handleTypeSelection(message, state, context) {
  const choice = message.trim();
  
  let type = null;
  if (choice === '1' || choice === '報價單' || choice === 'quotation') {
    type = 'quotation';
  } else if (choice === '2' || choice === '採購單' || choice === 'purchase') {
    type = 'purchase';
  } else if (choice === '3' || choice === '銷貨單' || choice === 'sales') {
    type = 'sales';
  } else {
    return '請回覆數字 1-3 選擇單據類型。';
  }

  // Generate PDF
  return await generateAndSendPDF(state.orderId, state.orderNumber, type, state.order, context);
}

/**
 * Generate PDF and convert to images, then auto-send to LINE
 */
async function generateAndSendPDF(orderId, orderNumber, type, order, context) {
  try {
    console.log(`[PDF] Generating ${type} for order ${orderNumber}`);

    const typeNames = {
      quotation: '報價單',
      purchase: '採購單',
      sales: '銷貨單'
    };
    const typeName = typeNames[type] || type;

    // Step 1: Create directories
    const pdfDir = '/tmp/clawdbot-pdf';
    const canvasDir = '/Users/liaoyacheng/clawd/canvas';  // ← 改為 canvas 目錄
    
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }
    if (!fs.existsSync(canvasDir)) {
      fs.mkdirSync(canvasDir, { recursive: true });
    }

    // Step 2: Download PDF from ERP
    const pdfPath = path.join(pdfDir, `${orderId}-${type}.pdf`);
    const pdfUrl = `${ERP_API_BASE}/api/orders/${orderId}/pdf?type=${type}`;
    
    console.log(`[PDF] Downloading PDF from ${pdfUrl}`);
    
    const token = await ensureAuthenticated();
    const pdfResponse = await fetch(pdfUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!pdfResponse.ok) {
      console.error(`[PDF] PDF download failed: ${pdfResponse.status}`);
      return `${typeName}生成失敗（${pdfResponse.status}）\n請確認訂單類型是否正確。`;
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    fs.writeFileSync(pdfPath, Buffer.from(pdfBuffer));
    console.log(`[PDF] PDF saved to ${pdfPath} (${pdfBuffer.byteLength} bytes)`);

    // Step 3: Convert PDF to PNG using pdftoppm
    // 使用有意義的檔名
    const baseFilename = `${type}-${orderNumber}`;
    const outputPrefix = path.join(canvasDir, baseFilename);
    const convertCmd = `pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`;
    
    console.log(`[PDF] Converting PDF to images: ${convertCmd}`);
    execSync(convertCmd);

    // Step 4: Find all generated PNG files
    const files = fs.readdirSync(canvasDir);
    const imageFiles = files
      .filter(f => f.startsWith(baseFilename) && f.endsWith('.png'))
      .sort()
      .map(f => path.join(canvasDir, f));

    console.log(`[PDF] Generated ${imageFiles.length} image(s):`, imageFiles);

    if (imageFiles.length === 0) {
      return `${typeName}生成成功，但圖片轉換失敗。\nPDF 位置：${pdfPath}`;
    }

    // Step 5: Build public URLs and prepare simple response
    const publicBaseUrl = 'https://suiyao.a.pinggy.link/__openclaw__/canvas';
    const userId = context?.userId || context?.channelUserId;
    
    // 構建圖片 URL 列表
    const imageUrls = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const imgPath = imageFiles[i];
      const filename = path.basename(imgPath);
      const publicUrl = `${publicBaseUrl}/${filename}`;
      imageUrls.push({
        url: publicUrl,
        filename: filename,
        caption: i === 0 
          ? `${typeName} - ${orderNumber}\n客戶：${order.customerName}\n(第 ${i + 1}/${imageFiles.length} 頁)`
          : `(第 ${i + 1}/${imageFiles.length} 頁)`
      });
      
      console.log(`[PDF] Image ${i + 1}/${imageFiles.length}: ${publicUrl}`);
    }

    // Step 6: 自動發送圖片到用戶
    if (userId) {
      console.log(`[PDF] Auto-sending ${imageFiles.length} image(s) to user ${userId}`);
      
      let successCount = 0;
      for (const img of imageUrls) {
        const sent = await sendImageToLineUser(img.url, userId, img.caption);
        if (sent) successCount++;
      }
      
      if (successCount === imageUrls.length) {
        return `✅ ${typeName}已生成並發送\n`
          + `📋 ${orderNumber}\n`
          + `👤 ${order.customerName}\n`
          + `📄 共 ${imageFiles.length} 頁`;
      } else {
        return `✅ ${typeName}已生成\n`
          + `⚠️ 圖片發送部分失敗（${successCount}/${imageFiles.length} 成功）\n`
          + `📄 PDF 位置：${pdfPath}`;
      }
      
    } else {
      // 無 userId 時的簡單提示
      return `✅ ${typeName}已生成\n`
        + `📋 ${orderNumber}\n`
        + `👤 ${order.customerName}\n`
        + `📄 共 ${imageFiles.length} 頁\n\n`
        + `⚠️ 無法自動發送（缺少用戶 ID）\n`
        + `📄 PDF 位置：${pdfPath}`;
    }

  } catch (error) {
    console.error('[PDF] Generation error:', error);
    return `生成失敗：${error.message}\n請確認 pdftoppm 工具是否已安裝。`;
  }
}

// ========================================
// Export
// ========================================

module.exports = {
  generatePDF,
  parseMessage,
  generateAndSendPDF
};
