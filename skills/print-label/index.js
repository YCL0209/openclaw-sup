/**
 * Print Label Skill for Clawdbot
 *
 * 透過精臣標籤機列印標籤（文字、條碼、QR Code）
 * 支援自由文字標籤和 ERP 產品標籤
 */

const http = require('http');

// ========================================
// Configuration
// ========================================

const PRINTER_API_URL = process.env.PRINTER_API_URL || 'http://10.0.5.125:3000';
const PRINTER_API_KEY = process.env.PRINTER_API_KEY || '0123456';
const LABEL_WIDTH = parseInt(process.env.LABEL_WIDTH) || 40;
const LABEL_HEIGHT = parseInt(process.env.LABEL_HEIGHT) || 30;

// ERP config (for product label lookup)
const ERP_API_BASE = process.env.ERP_API_URL || 'http://localhost:3000';
const ERP_TAX_ID = process.env.ERP_TAX_ID || '00091103';
const ERP_BOT_EMAIL = process.env.ERP_BOT_EMAIL || 'info@sui-yao.com';
const ERP_BOT_PASSWORD = process.env.ERP_BOT_PASSWORD || '000000';

// Layout defaults (mm)
const MARGIN_LEFT = 5;
const MARGIN_TOP = 3;
const TEXT_WIDTH = LABEL_WIDTH - MARGIN_LEFT - 5;
const DEFAULT_FONT_SIZE = 4;

// ========================================
// ERP Token Management
// ========================================

let jwtToken = null;
let sessionId = null;
let tokenExpiry = 0;

async function ensureAuthenticated() {
  const now = Date.now();
  if (jwtToken && now < tokenExpiry - 60000) return jwtToken;

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
        return jwtToken;
      }
    } catch (e) {
      console.warn('[PRINT] Token refresh failed:', e.message);
    }
  }

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
    throw new Error(`ERP 登入失敗: ${data.message}`);
  }

  jwtToken = data.data.token;
  sessionId = data.data.sessionId;
  tokenExpiry = now + (data.data.expiresIn * 1000);
  return jwtToken;
}

async function erpFetch(path, options = {}) {
  const token = await ensureAuthenticated();
  const response = await fetch(`${ERP_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  return response.json();
}

// ========================================
// Printer API
// ========================================

function sendPrintJob(labelData) {
  return new Promise((resolve, reject) => {
    const url = new URL('/print-label', PRINTER_API_URL);
    const postData = JSON.stringify(labelData);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PRINTER_API_KEY,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Invalid response: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('列印請求逾時'));
    });

    req.write(postData);
    req.end();
  });
}

function checkPrinterStatus() {
  return new Promise((resolve, reject) => {
    const url = new URL('/printer/status', PRINTER_API_URL);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { 'x-api-key': PRINTER_API_KEY },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('無法解析印表機狀態'));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('印表機連線逾時'));
    });

    req.end();
  });
}

// ========================================
// Message Parsing
// ========================================

/**
 * Parse user message to extract label parameters
 *
 * Supported formats:
 *   印標籤 文字內容
 *   印標籤 文字內容 x3
 *   印標籤 品名:ABC 條碼:123
 *   印標籤 品名:ABC 條碼:123 x5
 *   印產品標籤 ABC-001
 */
function parseMessage(message) {
  const result = {
    mode: 'text',       // 'text' | 'barcode' | 'product'
    text: '',
    barcode: null,
    qrcode: null,
    copies: 1,
    productNo: null,
  };

  // Remove trigger words
  let cleaned = message
    .replace(/^(列印標籤|印標籤|標籤列印|印貼紙|print\s*label|列印貼紙|印\s*標籤)\s*/i, '')
    .trim();

  // Check for product label mode
  const productMatch = cleaned.match(/^(印?產品標籤|product)\s+(.+)/i);
  if (productMatch) {
    result.mode = 'product';
    result.productNo = productMatch[2].trim();
    return result;
  }

  // Extract copies (x3, x5, etc.)
  const copiesMatch = cleaned.match(/[xX×]\s*(\d+)\s*$/);
  if (copiesMatch) {
    result.copies = parseInt(copiesMatch[1]);
    cleaned = cleaned.replace(/[xX×]\s*\d+\s*$/, '').trim();
  }

  // Extract barcode
  const barcodeMatch = cleaned.match(/條碼[:：]\s*(\S+)/);
  if (barcodeMatch) {
    result.barcode = barcodeMatch[1];
    result.mode = 'barcode';
    cleaned = cleaned.replace(/條碼[:：]\s*\S+/, '').trim();
  }

  // Extract QR code
  const qrcodeMatch = cleaned.match(/[Qq][Rr]\s*[Cc]ode[:：]\s*(\S+)/);
  if (qrcodeMatch) {
    result.qrcode = qrcodeMatch[1];
    result.mode = 'barcode';
    cleaned = cleaned.replace(/[Qq][Rr]\s*[Cc]ode[:：]\s*\S+/, '').trim();
  }

  // Extract product name (品名:xxx)
  const nameMatch = cleaned.match(/品名[:：]\s*(\S+)/);
  if (nameMatch) {
    result.text = nameMatch[1];
    cleaned = cleaned.replace(/品名[:：]\s*\S+/, '').trim();
  }

  // Remaining text is the label content
  if (!result.text && cleaned) {
    result.text = cleaned;
  }

  return result;
}

// ========================================
// Label Layout Builder
// ========================================

function buildTextLabel(text, copies) {
  // Split by / or \n for multi-line
  const lines = text.split(/[\/\n]/).map(l => l.trim()).filter(Boolean);
  const lineCount = lines.length;

  // Available height (minus top/bottom margins)
  const availHeight = LABEL_HEIGHT - MARGIN_TOP - 3;

  // Font size based on line count and text length
  let fontSize, lineHeight;
  if (lineCount === 1) {
    fontSize = lines[0].length <= 6 ? 7 : (lines[0].length <= 10 ? 5 : 4);
    lineHeight = fontSize + 4;
  } else if (lineCount === 2) {
    fontSize = 6;
    lineHeight = Math.floor(availHeight / 2);
  } else {
    fontSize = 5;
    lineHeight = Math.floor(availHeight / lineCount);
  }

  // Calculate starting y to center content vertically
  const totalHeight = lineHeight * lineCount;
  const startY = MARGIN_TOP + Math.round((availHeight - totalHeight) / 2);

  const content = lines.map((line, i) => ({
    type: 'text',
    x: MARGIN_LEFT,
    y: startY + (i * lineHeight),
    width: TEXT_WIDTH,
    height: lineHeight,
    value: line,
    fontSize,
  }));

  return {
    label: { width: LABEL_WIDTH, height: LABEL_HEIGHT, rotate: 0 },
    content,
    copies,
  };
}

function buildBarcodeLabel(text, barcode, qrcode, copies) {
  const content = [];
  let y = MARGIN_TOP;

  // Text (product name)
  if (text) {
    content.push({
      type: 'text',
      x: MARGIN_LEFT,
      y,
      width: TEXT_WIDTH,
      height: 8,
      value: text,
      fontSize: 4,
      bold: true,
    });
    y += 10;
  }

  // Barcode
  if (barcode) {
    content.push({
      type: 'barcode',
      x: MARGIN_LEFT,
      y,
      width: TEXT_WIDTH,
      height: 10,
      value: barcode,
      barcodeType: 'CODE128',
    });
    y += 12;
  }

  // QR Code
  if (qrcode) {
    const qrSize = 15;
    content.push({
      type: 'qrcode',
      x: Math.round((LABEL_WIDTH - qrSize) / 2),
      y,
      width: qrSize,
      height: qrSize,
      value: qrcode,
    });
  }

  return {
    label: { width: LABEL_WIDTH, height: LABEL_HEIGHT, rotate: 0 },
    content,
    copies,
  };
}

function buildProductLabel(productNo, productName, copies) {
  return {
    label: { width: LABEL_WIDTH, height: LABEL_HEIGHT, rotate: 0 },
    content: [
      {
        type: 'text',
        x: MARGIN_LEFT,
        y: MARGIN_TOP,
        width: TEXT_WIDTH,
        height: 8,
        value: productName || productNo,
        fontSize: 4,
        bold: true,
      },
      {
        type: 'barcode',
        x: MARGIN_LEFT,
        y: 14,
        width: TEXT_WIDTH,
        height: 12,
        value: productNo,
        barcodeType: 'CODE128',
      },
    ],
    copies,
  };
}

// ========================================
// Main Entry
// ========================================

async function printLabel(message, context) {
  const parsed = parseMessage(message);

  // Validate input
  if (!parsed.text && !parsed.productNo && !parsed.barcode && !parsed.qrcode) {
    return '請提供標籤內容。\n\n用法：\n• 印標籤 文字內容\n• 印標籤 品名:ABC 條碼:123\n• 印標籤 文字 x3（印 3 張）\n• 印產品標籤 品號';
  }

  try {
    let labelData;
    let summary;

    if (parsed.mode === 'product') {
      // Query ERP for product info
      const data = await erpFetch(`/api/products/search?keyword=${encodeURIComponent(parsed.productNo)}`);

      if (!data.success || !data.data || data.data.length === 0) {
        return `找不到品號「${parsed.productNo}」，請確認品號是否正確。`;
      }

      const product = data.data[0];
      labelData = buildProductLabel(
        product.productNo || parsed.productNo,
        product.name || product.productName,
        parsed.copies
      );
      summary = `品號：${product.productNo || parsed.productNo}\n品名：${product.name || product.productName}`;

    } else if (parsed.mode === 'barcode') {
      labelData = buildBarcodeLabel(parsed.text, parsed.barcode, parsed.qrcode, parsed.copies);
      const parts = [];
      if (parsed.text) parts.push(`品名：${parsed.text}`);
      if (parsed.barcode) parts.push(`條碼：${parsed.barcode}`);
      if (parsed.qrcode) parts.push(`QR Code：${parsed.qrcode}`);
      summary = parts.join('\n');

    } else {
      labelData = buildTextLabel(parsed.text, parsed.copies);
      summary = `內容：${parsed.text}`;
    }

    // Send print job
    const result = await sendPrintJob(labelData);

    if (result.success) {
      return `✅ 標籤已列印（${parsed.copies} 張）\n${summary}`;
    } else {
      return `❌ 列印失敗：${result.error || result.message || '未知錯誤'}`;
    }

  } catch (err) {
    console.error('[PRINT] Error:', err);

    if (err.message.includes('ECONNREFUSED') || err.message.includes('逾時')) {
      return '❌ 無法連接印表機服務，請確認 Windows 電腦和標籤機已開啟。';
    }
    return `❌ 列印失敗：${err.message}`;
  }
}

// ========================================
// Exports
// ========================================

module.exports = {
  printLabel,
  parseMessage,
  buildTextLabel,
  buildBarcodeLabel,
  buildProductLabel,
  sendPrintJob,
  checkPrinterStatus,
};
