#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const execAsync = promisify(exec);

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 工作目錄
const WORKSPACE = process.env.HOME + '/clawd';
const UPLOAD_DIR = join(WORKSPACE, 'uploads');

// ERP 配置（從 create-order skill 複製）
const ERP_API_BASE = process.env.ERP_API_URL || 'http://localhost:3000';
const ERP_TAX_ID = process.env.ERP_TAX_ID || '00091103';
const ERP_BOT_EMAIL = process.env.ERP_BOT_EMAIL || 'info@sui-yao.com';
const ERP_BOT_PASSWORD = process.env.ERP_BOT_PASSWORD || '000000';

// JWT Token 管理
let jwtToken = null;
let tokenExpiry = 0;

// 確保 uploads 目錄存在
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * ERP 認證
 */
async function ensureAuthenticated() {
  const now = Date.now();
  
  if (jwtToken && now < tokenExpiry - 60000) {
    return jwtToken;
  }

  try {
    const response = await axios.post(`${ERP_API_BASE}/api/auth/login`, {
      taxId: ERP_TAX_ID,
      email: ERP_BOT_EMAIL,
      password: ERP_BOT_PASSWORD
    });

    if (response.data.success) {
      jwtToken = response.data.data.token;
      tokenExpiry = Date.now() + (8 * 60 * 60 * 1000); // 8小時
      console.log('[pdf-to-order] ERP 認證成功');
      return jwtToken;
    }
  } catch (error) {
    console.error('[pdf-to-order] ERP 認證失敗:', error.message);
    throw new Error('ERP 認證失敗');
  }
}

/**
 * 呼叫 ERP API
 */
async function erpFetch(path, options = {}) {
  const token = await ensureAuthenticated();
  
  const response = await axios({
    method: options.method || 'GET',
    url: `${ERP_API_BASE}${path}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    data: options.body ? JSON.parse(options.body) : undefined
  });

  return response.data;
}

/**
 * 查詢或建立客戶
 */
async function findOrCreateCustomer(customerName, customerInfo = {}) {
  try {
    // 1. 先查詢客戶
    const searchResult = await erpFetch(`/api/customers?search=${encodeURIComponent(customerName)}`);
    
    if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
      const customer = searchResult.data[0];
      console.log(`[pdf-to-order] 找到客戶: ${customer.name} (${customer._id})`);
      return { customerId: customer._id, customer };
    }

    // 2. 客戶不存在，建立新客戶
    console.log(`[pdf-to-order] 客戶不存在，建立新客戶: ${customerName}`);
    
    const createResult = await erpFetch('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: customerName,
        type: 'supplier', // PDF 上傳通常是供應商報價單
        phone: customerInfo.phone || '',
        email: customerInfo.email || '',
        taxId: customerInfo.taxId || '',
        active: true
      })
    });

    if (createResult.success) {
      console.log(`[pdf-to-order] 客戶建立成功: ${createResult.data.customerCode}`);
      return { customerId: createResult.data._id, customer: createResult.data };
    } else {
      throw new Error(createResult.message || '建立客戶失敗');
    }
  } catch (error) {
    console.error('[pdf-to-order] 客戶處理失敗:', error);
    throw error;
  }
}

/**
 * 在 ERP 中建立訂單
 */
async function createOrderInERP(orderInfo, customerId, customer) {
  try {
    const orderPayload = {
      orderType: orderInfo.orderType || 'purchase',
      customerId: customerId,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      shippingAddress: '',
      items: orderInfo.items.map(item => ({
        productCode: item.productCode || item.productName,
        productName: item.productName || item.productCode,  // ← 保留完整品名！
        quantity: item.quantity,
        unitPrice: item.price || 0
      })),
      paymentInfo: {
        method: 'cash',
        isPaid: false,
        paidAmount: 0
      },
      notes: 'PDF 報價單自動建立'
    };

    console.log('[pdf-to-order] 建立訂單:', JSON.stringify(orderPayload, null, 2));

    const result = await erpFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });

    if (!result.success) {
      throw new Error(result.message || '建立訂單失敗');
    }

    return result.data;
  } catch (error) {
    console.error('[pdf-to-order] 訂單建立失敗:', error);
    throw error;
  }
}

/**
 * 主入口函數
 */
export async function processPdfOrder(message, context = {}, claudeApi = null) {
  console.log('[pdf-to-order] 開始處理 PDF 訂單');
  console.log('[pdf-to-order] Message:', message);
  console.log('[pdf-to-order] Context:', JSON.stringify(context, null, 2));

  try {
    // 1. 檢查是否有 PDF 附件或指定檔名
    const pdfInfo = await detectPdf(message, context);
    if (!pdfInfo.found) {
      return {
        success: false,
        message: '未偵測到 PDF 文件。請上傳 PDF 報價單或指定檔名。'
      };
    }

    // 2. 檢查用戶是否已明確表達意圖
    const userIntent = detectUserIntent(message, context);
    
    // 3. 下載或讀取 PDF
    const pdfPath = await downloadPdf(pdfInfo, context);
    if (!pdfPath) {
      return {
        success: false,
        message: '❌ 檔案格式不支援\n\n此功能目前只支援 **PDF 格式** 的報價單。\n\n請：\n1️⃣ 將文件轉存為 PDF 後重新上傳\n2️⃣ 或使用「手動輸入」方式建立訂單\n\n💡 提示：Excel/Word 可以「另存新檔 → PDF」'
      };
    }

    // 4. 提取 PDF 文字
    const pdfText = await extractPdfText(pdfPath);
    if (!pdfText) {
      return {
        success: false,
        message: '無法讀取 PDF 內容。請確認文件格式是否正確。'
      };
    }

    // 5. 如果沒有明確意圖，詢問用戶
    if (!userIntent) {
      return {
        success: true,
        action: 'waitingForUserIntent',
        message: formatIntentQuestion(pdfPath, pdfText),
        state: {
          pdfPath,
          pdfText
        }
      };
    }

    // 6. 根據意圖執行對應動作
    return await executeIntent(userIntent, pdfPath, pdfText, message);

  } catch (error) {
    console.error('[pdf-to-order] 錯誤:', error);
    return {
      success: false,
      message: `處理 PDF 時發生錯誤：${error.message}`,
      error: error.stack
    };
  }
}

/**
 * 偵測用戶意圖
 */
function detectUserIntent(message, context) {
  const msgLower = message.toLowerCase();

  // 意圖 1: 截取文字
  if (msgLower.includes('截取') || msgLower.includes('提取') || 
      msgLower.includes('extract') || msgLower.includes('文字')) {
    return 'extract';
  }

  // 意圖 2: 建立採購單
  if (msgLower.includes('採購') || msgLower.includes('購買') || 
      msgLower.includes('我要買') || msgLower.includes('purchase')) {
    return 'purchase';
  }

  // 意圖 3: 建立銷貨單
  if (msgLower.includes('銷貨') || msgLower.includes('報價') || 
      msgLower.includes('賣') || msgLower.includes('sales') || 
      msgLower.includes('quotation')) {
    return 'sales';
  }

  // 沒有明確意圖
  return null;
}

/**
 * 格式化意圖詢問訊息
 */
function formatIntentQuestion(pdfPath, pdfText) {
  const fileName = basename(pdfPath);
  const textPreview = pdfText.substring(0, 200).trim();
  
  let message = `📄 已收到 PDF 文件：${fileName}\n\n`;
  message += `請選擇要執行的動作：\n\n`;
  message += `1️⃣ 截取文字回傳\n`;
  message += `   → 只提取 PDF 文字內容\n\n`;
  message += `2️⃣ 建立採購單\n`;
  message += `   → 從 PDF 解析品項並建立採購訂單（PUR-）\n\n`;
  message += `3️⃣ 建立銷貨單\n`;
  message += `   → 從 PDF 解析品項並建立銷售訂單（ORD-）\n\n`;
  message += `請回覆數字（1、2 或 3）或關鍵詞（截取/採購/銷貨）`;

  return message;
}

/**
 * 執行對應意圖的動作
 */
async function executeIntent(intent, pdfPath, pdfText, originalMessage) {
  console.log(`[pdf-to-order] 執行意圖: ${intent}`);

  switch (intent) {
    case 'extract':
      // 只回傳文字內容
      return {
        success: true,
        action: 'textExtracted',
        message: formatExtractedText(pdfText),
        data: { pdfText }
      };

    case 'purchase':
    case 'sales':
      // 解析並建立訂單
      const orderInfo = parsePdfOrder(pdfText, originalMessage);
      if (!orderInfo.success) {
        return {
          success: false,
          message: `❌ 無法從 PDF 中解析訂單資訊。\n\n可能原因：\n1. PDF 格式不是報價單\n2. 表格結構無法識別\n3. 文字提取失敗\n\n請手動輸入訂單資訊。`,
          debug: {
            pdfText: pdfText.substring(0, 500) + '...'
          }
        };
      }

      // 強制設定訂單類型
      orderInfo.data.orderType = intent === 'purchase' ? 'purchase' : 'sales';

      // 直接建立訂單（不再等待確認）
      try {
        console.log('[pdf-to-order] 開始建立訂單...');
        
        // 查詢或建立客戶
        const { customerId, customer } = await findOrCreateCustomer(orderInfo.data.customerName);
        
        // 建立訂單
        const order = await createOrderInERP(orderInfo.data, customerId, customer);
        
        const typeName = orderInfo.data.orderType === 'purchase' ? '採購單' : '銷售單';
        const totalAmount = orderInfo.data.items.reduce((sum, item) => 
          sum + (item.quantity * (item.price || 0)), 0
        );
        
        const itemsList = orderInfo.data.items.map(item => 
          `  • ${item.productCode} ${item.productName} × ${item.quantity} @ NT$${item.price || 0}`
        ).join('\n');
        
        return {
          success: true,
          message: `✅ ${typeName}建立成功！\n`
            + `━━━━━━━━━━━━━━━━\n`
            + `📋 訂單編號：${order.orderNumber}\n`
            + `👤 ${orderInfo.data.orderType === 'purchase' ? '供應商' : '客戶'}：${customer.name}\n`
            + `📦 品項：\n${itemsList}\n`
            + `💰 總額：NT$ ${totalAmount.toLocaleString()}\n`
            + `⏱️ 狀態：待處理\n`
            + `━━━━━━━━━━━━━━━━`,
          data: {
            orderNumber: order.orderNumber,
            orderId: order._id,
            customerId: customerId,
            totalAmount: totalAmount
          }
        };
      } catch (error) {
        console.error('[pdf-to-order] 訂單建立失敗:', error);
        return {
          success: false,
          message: `❌ 訂單建立失敗\n\n錯誤訊息：${error.message}\n\n請聯絡系統管理員或手動建立訂單。`
        };
      }

    default:
      return {
        success: false,
        message: '未知的意圖類型'
      };
  }
}

/**
 * 格式化提取的文字
 */
function formatExtractedText(pdfText) {
  const maxLength = 2000;
  const truncated = pdfText.length > maxLength;
  const displayText = truncated ? pdfText.substring(0, maxLength) : pdfText;

  let message = `📄 PDF 文字內容\n`;
  message += `━━━━━━━━━━━━━━━━\n`;
  message += displayText;
  if (truncated) {
    message += `\n...\n（文字過長，已截斷。共 ${pdfText.length} 字元）`;
  }
  message += `\n━━━━━━━━━━━━━━━━`;

  return message;
}

/**
 * 偵測 PDF 來源
 */
async function detectPdf(message, context) {
  console.log('[pdf-to-order] detectPdf - message:', message);
  console.log('[pdf-to-order] detectPdf - context:', JSON.stringify(context, null, 2));

  // 方式 1: LINE 訊息附件 - 偵測 <media:document> 標記
  if (message.includes('<media:document>')) {
    console.log('[pdf-to-order] 偵測到 LINE 媒體文件');
    
    // 從 context 取得 messageId
    const messageId = context.messageId || extractMessageId(message);
    
    if (messageId) {
      console.log('[pdf-to-order] Message ID:', messageId);
      return {
        found: true,
        type: 'line-attachment',
        messageId: messageId
      };
    } else {
      console.error('[pdf-to-order] 無法取得 messageId');
    }
  }

  // 方式 2: OpenClaw attachments（如果未來支援）
  if (context.attachments && context.attachments.length > 0) {
    const pdfAttachment = context.attachments.find(att => 
      att.contentType === 'application/pdf' || att.fileName?.endsWith('.pdf')
    );
    if (pdfAttachment) {
      console.log('[pdf-to-order] 找到 PDF attachment:', pdfAttachment);
      return {
        found: true,
        type: 'line-attachment',
        messageId: context.messageId,
        attachment: pdfAttachment
      };
    }
  }

  // 方式 3: 用戶指定檔名（例如：「根據 quote.pdf 建立採購單」）
  const fileNameMatch = message.match(/([a-zA-Z0-9_\-\.]+\.pdf)/i);
  if (fileNameMatch) {
    const fileName = fileNameMatch[1];
    const localPath = join(UPLOAD_DIR, fileName);
    if (existsSync(localPath)) {
      console.log('[pdf-to-order] 找到本地檔案:', localPath);
      return {
        found: true,
        type: 'local-file',
        path: localPath,
        fileName
      };
    }
  }

  console.log('[pdf-to-order] 未偵測到 PDF');
  return { found: false };
}

/**
 * 從訊息中提取 messageId（從 [message_id: xxx] 標記）
 */
function extractMessageId(message) {
  const match = message.match(/\[message_id:\s*([^\]]+)\]/);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * 偵測檔案類型（使用 file 命令）
 */
async function detectFileType(filePath) {
  try {
    const { stdout } = await execAsync(`file -b --mime-type "${filePath}"`);
    return stdout.trim();
  } catch (error) {
    console.error('[pdf-to-order] 偵測檔案類型失敗:', error);
    // 備用方案：檢查檔案簽名（magic bytes）
    try {
      const buffer = readFileSync(filePath);
      const header = buffer.slice(0, 4).toString('hex');
      
      // PDF 檔案以 %PDF 開頭（25 50 44 46）
      if (buffer.slice(0, 4).toString() === '%PDF') {
        return 'application/pdf';
      }
      
      // 其他常見格式
      if (header === '504b0304') return 'application/zip'; // ZIP/DOCX/XLSX
      if (header === 'd0cf11e0') return 'application/msword'; // DOC/XLS
      
      return 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }
}

/**
 * 下載或讀取 PDF
 */
async function downloadPdf(pdfInfo, context) {
  if (pdfInfo.type === 'local-file') {
    console.log(`[pdf-to-order] 使用本地文件: ${pdfInfo.path}`);
    
    // 檢查檔案是否為 PDF
    const fileType = await detectFileType(pdfInfo.path);
    console.log(`[pdf-to-order] 本地檔案類型: ${fileType}`);
    
    if (!fileType.toLowerCase().includes('pdf')) {
      console.error(`[pdf-to-order] 本地檔案不是 PDF: ${fileType}`);
      return null;
    }
    
    return pdfInfo.path;
  }

  if (pdfInfo.type === 'line-attachment') {
    console.log('[pdf-to-order] 準備從 LINE 下載 PDF...');
    
    const lineConfig = getLineConfig();
    if (!lineConfig) {
      console.error('[pdf-to-order] LINE 配置不存在');
      return null;
    }

    try {
      const messageId = pdfInfo.messageId;
      
      // LINE API: 獲取文件內容
      // https://api-data.line.me/v2/bot/message/{messageId}/content
      const contentUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
      
      console.log(`[pdf-to-order] 下載 URL: ${contentUrl}`);
      console.log(`[pdf-to-order] Message ID: ${messageId}`);
      
      const response = await axios({
        method: 'GET',
        url: contentUrl,
        headers: {
          'Authorization': `Bearer ${lineConfig.channelAccessToken}`
        },
        responseType: 'arraybuffer',
        timeout: 30000 // 30 秒超時
      });

      // 檢查 Content-Type（如果有的話）
      const contentType = response.headers['content-type'];
      console.log(`[pdf-to-order] Content-Type: ${contentType}`);
      
      // 確保下載目錄存在
      const downloadDir = lineConfig.mediaDownloadPath || UPLOAD_DIR;
      if (!existsSync(downloadDir)) {
        mkdirSync(downloadDir, { recursive: true });
      }

      // 儲存到本地（先用通用檔名）
      const tempFileName = `line-file-${messageId}-${Date.now()}`;
      const tempPath = join(downloadDir, tempFileName);
      writeFileSync(tempPath, response.data);
      
      console.log(`[pdf-to-order] 檔案已下載: ${tempPath} (${response.data.length} bytes)`);
      
      // 檢查檔案類型（使用 file 命令）
      const fileType = await detectFileType(tempPath);
      console.log(`[pdf-to-order] 檔案類型: ${fileType}`);
      
      // 驗證是否為 PDF（不區分大小寫）
      if (!fileType.toLowerCase().includes('pdf')) {
        // 刪除非 PDF 檔案
        try {
          const fs = await import('fs');
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.error('[pdf-to-order] 刪除暫存檔失敗:', e);
        }
        
        console.error(`[pdf-to-order] 檔案不是 PDF 格式: ${fileType}`);
        return null; // 會在後續處理中回傳錯誤訊息
      }
      
      // 重新命名為 .pdf
      const finalPath = tempPath + '.pdf';
      const fs = await import('fs');
      fs.renameSync(tempPath, finalPath);
      
      console.log(`[pdf-to-order] PDF 驗證成功: ${finalPath}`);
      return finalPath;

    } catch (error) {
      console.error('[pdf-to-order] LINE 下載失敗:', error.message);
      if (error.response) {
        console.error('[pdf-to-order] HTTP Status:', error.response.status);
        console.error('[pdf-to-order] Response:', error.response.data);
      }
      return null;
    }
  }

  return null;
}

/**
 * 提取 PDF 文字（使用 pdf-extract skill）
 */
async function extractPdfText(pdfPath) {
  try {
    console.log(`[pdf-to-order] 提取 PDF 文字: ${pdfPath}`);
    
    // 使用 pdftotext 命令
    const { stdout } = await execAsync(`pdftotext "${pdfPath}" -`);
    
    if (!stdout || stdout.trim().length === 0) {
      console.error('[pdf-to-order] PDF 文字提取為空');
      return null;
    }

    console.log(`[pdf-to-order] 提取成功，長度: ${stdout.length} 字元`);
    return stdout;

  } catch (error) {
    console.error('[pdf-to-order] PDF 提取失敗:', error.message);
    return null;
  }
}

/**
 * 解析 PDF 訂單資訊
 */
function parsePdfOrder(pdfText, originalMessage) {
  console.log('[pdf-to-order] 開始解析訂單資訊');

  try {
    // 判斷訂單類型
    const orderType = determineOrderType(originalMessage, pdfText);

    // 提取供應商/客戶名稱
    const customerName = extractCustomerName(pdfText);
    if (!customerName) {
      return { success: false, error: '無法識別供應商/客戶名稱' };
    }

    // 提取品項清單
    const items = extractItems(pdfText);
    if (!items || items.length === 0) {
      return { success: false, error: '無法識別品項資訊' };
    }

    // 提取總額
    const totalAmount = extractTotalAmount(pdfText);

    return {
      success: true,
      data: {
        orderType,
        customerName,
        items,
        totalAmount,
        confidence: calculateConfidence(customerName, items, totalAmount)
      }
    };

  } catch (error) {
    console.error('[pdf-to-order] 解析錯誤:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 判斷訂單類型
 */
function determineOrderType(message, pdfText) {
  const msgLower = message.toLowerCase();
  const pdfLower = pdfText.toLowerCase();

  // 關鍵詞判斷
  const purchaseKeywords = ['採購', '購買', 'purchase', '我要買', '買'];
  const salesKeywords = ['報價', '銷售', 'quotation', '賣'];

  // 優先根據用戶訊息判斷
  if (purchaseKeywords.some(kw => msgLower.includes(kw))) {
    return 'purchase';
  }
  if (salesKeywords.some(kw => msgLower.includes(kw))) {
    return 'sales';
  }

  // 根據 PDF 內容判斷
  if (pdfText.includes('採購單') || pdfText.includes('Purchase Order')) {
    return 'purchase';
  }
  if (pdfText.includes('報價單') || pdfText.includes('Quotation')) {
    return 'sales';
  }

  // 預設為採購單（用戶說「我要購買」通常是採購）
  return 'purchase';
}

/**
 * 提取客戶/供應商名稱
 */
function extractCustomerName(pdfText) {
  // 策略 1: 尋找「供應商」「客戶」「賣方」「買方」等標記
  const patterns = [
    /(?:供應商|賣方|Supplier)[：:\s]*([^\n]+)/i,
    /(?:客戶|買方|Customer)[：:\s]*([^\n]+)/i,
    /(?:公司名稱|Company)[：:\s]*([^\n]+)/i
  ];

  for (const pattern of patterns) {
    const match = pdfText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 100) {
        console.log(`[pdf-to-order] 找到客戶名稱: ${name}`);
        return name;
      }
    }
  }

  // 策略 2: 取第一行（通常是公司抬頭）
  const lines = pdfText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length > 2 && firstLine.length < 100) {
      console.log(`[pdf-to-order] 使用第一行作為客戶名稱: ${firstLine}`);
      return firstLine;
    }
  }

  return null;
}

/**
 * 提取品項清單
 */
function extractItems(pdfText) {
  const items = [];
  const lines = pdfText.split('\n').map(l => l.trim());
  
  console.log('[pdf-to-order] 開始解析品項...');
  
  // 策略 1: 多行式表格（品號、品名、數量分開）
  // 格式：
  // PRO-XXX
  // 品名
  // 數量 PC
  for (let i = 0; i < lines.length - 2; i++) {
    const line1 = lines[i];
    const line2 = lines[i + 1];
    const line3 = lines[i + 2];
    
    // 第1行：品號 (PRO-XXX)
    if (line1.match(/^PRO-\d+$/)) {
      const productCode = line1;
      
      // 第2行：品名（通常包含中文）
      const productName = line2;
      
      // 第3行：數量 + 單位 (例如: "20.00 PC")
      const qtyMatch = line3.match(/^(\d+(?:\.\d+)?)\s*(PC|EA|個|件|PCS)?/);
      
      if (qtyMatch) {
        const quantity = parseFloat(qtyMatch[1]);
        
        console.log(`[pdf-to-order] ✅ 找到品項: ${productCode} | ${productName} | x${quantity}`);
        
        items.push({
          productCode: productCode,
          productName: productName,
          quantity: quantity,
          price: 0  // 價格稍後填入
        });
      }
    }
  }
  
  // 尋找價格資訊（單獨的「單價」行）
  if (items.length > 0) {
    console.log('[pdf-to-order] 尋找價格資訊...');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      
      // 找到「單價」表頭
      if (line === '單價' || line.includes('單價')) {
        // 下一行應該是價格數字
        const priceMatch = nextLine.match(/^(\d+(?:\.\d+)?)/);
        if (priceMatch) {
          const unitPrice = parseFloat(priceMatch[1]);
          console.log(`[pdf-to-order] ✅ 找到單價: ${unitPrice}`);
          
          // 將價格填入第一個品項
          if (items.length > 0) {
            items[0].price = unitPrice;
            items[0].amount = items[0].quantity * unitPrice;
          }
          break;
        }
      }
    }
  }

  if (items.length > 0) {
    console.log(`[pdf-to-order] ✅ 解析完成，共 ${items.length} 個品項`);
    items.forEach((item, idx) => {
      console.log(`[pdf-to-order]   ${idx + 1}. ${item.productCode} x${item.quantity} @${item.price}`);
    });
    return items;
  }

  // 策略 2: 同行式格式（PRO-XXX 品名 數量 價格）
  console.log('[pdf-to-order] 嘗試同行式解析...');
  const proPattern = /(PRO-\d+)\s+([^\d]+)\s+(\d+(?:\.\d+)?)\s+.*?(\d+(?:\.\d+)?)/g;
  let match;
  
  while ((match = proPattern.exec(pdfText)) !== null) {
    const [_, productCode, productName, quantity, price] = match;
    items.push({
      productCode: productCode.trim(),
      productName: productName.trim(),
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      amount: parseFloat(quantity) * parseFloat(price)
    });
    console.log(`[pdf-to-order] ✅ 找到: ${productCode} x${quantity} @${price}`);
  }

  if (items.length > 0) {
    console.log(`[pdf-to-order] ✅ 同行式解析成功，${items.length} 個品項`);
    return items;
  }

  console.log('[pdf-to-order] ⚠️ 無法解析品項資訊');
  return items;
}

/**
 * 提取總額
 */
function extractTotalAmount(pdfText) {
  const patterns = [
    /(?:總[計金]額?|Total)[：:\s]*(?:NT?\$)?\s*([\d,]+(?:\.\d+)?)/i,
    /(?:合計|小計|Subtotal)[：:\s]*(?:NT?\$)?\s*([\d,]+(?:\.\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = pdfText.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) {
        console.log(`[pdf-to-order] 找到總額: ${amount}`);
        return amount;
      }
    }
  }

  return 0;
}

/**
 * 計算解析信心度
 */
function calculateConfidence(customerName, items, totalAmount) {
  let score = 0;
  
  if (customerName) score += 0.3;
  if (items && items.length > 0) score += 0.4;
  if (totalAmount > 0) score += 0.3;
  
  return score;
}

/**
 * 格式化訂單確認訊息
 */
function formatOrderConfirmation(orderInfo) {
  const typeText = orderInfo.orderType === 'purchase' ? '採購單' : '銷售單';
  
  let message = `📄 已解析 PDF 報價單\n`;
  message += `━━━━━━━━━━━━━━━━\n`;
  message += `👤 ${orderInfo.orderType === 'purchase' ? '供應商' : '客戶'}：${orderInfo.customerName}\n`;
  message += `📦 品項：\n`;
  
  orderInfo.items.forEach((item, idx) => {
    const code = item.productCode ? `${item.productCode} ` : '';
    const name = item.productName || '(未知品名)';
    const qty = item.quantity;
    const price = item.price > 0 ? ` @ $${item.price.toLocaleString()}` : '';
    const amount = item.amount > 0 ? ` = $${item.amount.toLocaleString()}` : '';
    message += `  ${idx + 1}. ${code}${name} × ${qty}${price}${amount}\n`;
  });
  
  if (orderInfo.totalAmount > 0) {
    message += `💰 總額：NT$ ${orderInfo.totalAmount.toLocaleString()}\n`;
  }
  
  message += `━━━━━━━━━━━━━━━━\n`;
  message += `請確認是否要建立${typeText}？\n`;
  message += `回覆「確認」繼續，「取消」取消。`;
  
  return message;
}

/**
 * 獲取 LINE 配置
 */
function getLineConfig() {
  try {
    const configPath = join(process.env.HOME, '.openclaw', 'openclaw.json');
    if (!existsSync(configPath)) {
      console.error('[pdf-to-order] 配置文件不存在:', configPath);
      return null;
    }

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const lineChannel = config.channels?.line;
    
    if (!lineChannel || !lineChannel.channelAccessToken) {
      console.error('[pdf-to-order] LINE 配置不完整');
      return null;
    }

    console.log('[pdf-to-order] LINE 配置已載入');
    console.log('[pdf-to-order] Download path:', lineChannel.mediaDownloadPath);
    
    return lineChannel;
  } catch (error) {
    console.error('[pdf-to-order] 讀取 LINE 配置失敗:', error);
    return null;
  }
}

/**
 * 處理用戶選擇意圖（當之前詢問過意圖時）
 */
export async function handleUserIntentChoice(choice, state) {
  console.log('[pdf-to-order] 處理用戶選擇:', choice);

  if (!state || !state.pdfPath || !state.pdfText) {
    return {
      success: false,
      message: '狀態已過期，請重新上傳 PDF。'
    };
  }

  // 解析用戶選擇
  let intent = null;
  const choiceLower = choice.toLowerCase().trim();

  if (choiceLower === '1' || choiceLower.includes('截取') || choiceLower.includes('提取')) {
    intent = 'extract';
  } else if (choiceLower === '2' || choiceLower.includes('採購') || choiceLower.includes('購買')) {
    intent = 'purchase';
  } else if (choiceLower === '3' || choiceLower.includes('銷貨') || choiceLower.includes('報價')) {
    intent = 'sales';
  } else {
    return {
      success: false,
      message: '無效的選擇。請回覆 1、2 或 3。'
    };
  }

  // 執行對應動作
  return await executeIntent(intent, state.pdfPath, state.pdfText, choice);
}

/**
 * 確認並建立訂單（由 create-order skill 呼叫）
 */
export async function confirmPdfOrder(state, confirmed) {
  if (!confirmed) {
    return {
      success: true,
      message: '已取消建立訂單。'
    };
  }

  // 將解析的資訊傳給 create-order
  const orderInfo = state.orderInfo;
  
  // 格式化為 create-order 可接受的訊息格式
  let orderMessage = `${orderInfo.customerName} `;
  orderInfo.items.forEach(item => {
    const code = item.productCode || item.productName;
    orderMessage += `${code}x${item.quantity}@${item.price || 0} `;
  });

  return {
    success: true,
    action: 'createOrder',
    orderMessage: orderMessage.trim(),
    orderType: orderInfo.orderType
  };
}

// CLI 模式
if (import.meta.url === `file://${process.argv[1]}`) {
  const message = process.argv[2];
  const contextJson = process.argv[3];
  
  if (!message) {
    console.error('❌ 用法: node index.js "<message>" \'{"messageId":"xxx"}\'');
    process.exit(1);
  }
  
  let context = {};
  if (contextJson) {
    try {
      context = JSON.parse(contextJson);
    } catch (e) {
      console.error('❌ 無法解析 context JSON:', e.message);
      process.exit(1);
    }
  }
  
  console.log('[pdf-to-order] CLI 模式啟動');
  console.log('[pdf-to-order] Message:', message);
  console.log('[pdf-to-order] Context:', JSON.stringify(context, null, 2));
  
  processPdfOrder(message, context).then(result => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 處理結果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (result.success === false) {
      console.error('❌', result.message);
      if (result.debug) {
        console.log('\n🔍 除錯資訊:', JSON.stringify(result.debug, null, 2));
      }
      process.exit(1);
    }
    
    console.log('✅ 成功');
    console.log('\n' + result.message);
    
    if (result.orderInfo) {
      console.log('\n📦 訂單資訊:', JSON.stringify(result.orderInfo, null, 2));
    }
    
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ 執行錯誤:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}
