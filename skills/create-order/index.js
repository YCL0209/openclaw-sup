/**
 * Create Order Skill for Clawdbot + ERP Integration
 * 
 * This skill handles the complete order creation workflow:
 * 1. Parse user input (customer, items, address, notes)
 * 2. Query ERP customers
 * 3. Handle missing customers (create new or re-enter)
 * 4. Confirm order details with user
 * 5. Call ERP API to create order
 * 6. Return result (order number & status)
 */

// ========================================
// Configuration
// ========================================

const ERP_API_BASE = process.env.ERP_API_URL || 'http://localhost:3000';
const ERP_TAX_ID = process.env.ERP_TAX_ID || '00091103';
const ERP_BOT_EMAIL = process.env.ERP_BOT_EMAIL || 'info@sui-yao.com';
const ERP_BOT_PASSWORD = process.env.ERP_BOT_PASSWORD || '000000';

// ========================================
// Token Management
// ========================================

let jwtToken = null;
let sessionId = null;
let tokenExpiry = 0;

/**
 * Ensure we have a valid JWT token
 * Refresh if close to expiry, or re-authenticate if expired
 */
async function ensureAuthenticated() {
  const now = Date.now();
  
  // Token still valid (with 1-minute buffer)
  if (jwtToken && now < tokenExpiry - 60000) {
    return jwtToken;
  }

  // Try to refresh token
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
        console.log('[ERP] Token refreshed successfully');
        return jwtToken;
      }
    } catch (e) {
      console.warn('[ERP] Token refresh failed, re-authenticating...', e.message);
    }
  }

  // Re-authenticate
  console.log('[ERP] Authenticating as bot account...');
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
  
  console.log('[ERP] Authenticated successfully, token valid for', data.data.expiresIn, 'seconds');
  return jwtToken;
}

/**
 * Make authenticated ERP API call
 */
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
    console.error('[ERP] API error:', response.status, data);
  }

  return data;
}

// ========================================
// Data Models
// ========================================

/**
 * @typedef {Object} OrderItem
 * @property {string} name - Product name
 * @property {number} quantity - Quantity ordered
 */

/**
 * @typedef {Object} ParsedOrder
 * @property {string} customerName - Customer name
 * @property {string} [phone] - Phone number
 * @property {OrderItem[]} items - Items to order
 * @property {string} [address] - Shipping address
 * @property {string} [note] - Order notes
 * @property {number} confidence - Parsing confidence (0-1)
 */

// ========================================
// Main Skill Function
// ========================================

/**
 * Main entry point for create-order skill
 * 
 * @param {string} message - User message
 * @param {Object} context - Clawdbot context (user, channel, etc)
 * @param {Object} claudeApi - Claude API for AI parsing
 * @returns {Promise<string>} Response message to user
 */
async function createOrder(message, context, claudeApi) {
  try {
    // Check if this is a follow-up message
    const state = context.conversationState || {};
    
    // State machine: handle different conversation states
    if (state.waitingForConfirmation) {
      return handleConfirmation(message, state);
    }
    
    if (state.waitingForCustomerChoice) {
      return handleCustomerChoice(message, state);
    }

    // Step 1: Parse order message
    console.log('[Order] Parsing message:', message);
    const parsed = await parseOrderMessage(message, claudeApi);

    if (!parsed || parsed.confidence < 0.5) {
      return '無法理解訂單內容。請提供：客戶名稱、品項和數量。\n'
        + '範例："/order 王小明 A產品x2 B產品x1"';
    }

    // Ensure orderType is set from original message (safety net)
    if (!parsed.orderType) {
      const purchaseKeywords = ['採購', '採購單', '我要買', '買', 'purchase'];
      parsed.orderType = purchaseKeywords.some(kw => message.includes(kw)) ? 'purchase' : 'sales';
    }

    console.log('[Order] Parsed order:', JSON.stringify(parsed, null, 2));

    // Step 2: Query customer from ERP (使用後端搜尋，支援 name + taxId)
    console.log('[Order] Querying customer:', parsed.customerName);
    const searchQuery = encodeURIComponent(parsed.customerName);
    const customers = await erpFetch(`/api/customers?search=${searchQuery}`);
    
    if (!customers.success) {
      return '無法連接 ERP 系統。請稍後再試。';
    }

    // 後端已經搜尋過 name + taxId，直接取第一個結果或本地二次驗證
    const matchedCustomer = customers.data && customers.data.length > 0
      ? findCustomer(parsed.customerName, customers.data)
      : null;

    if (!matchedCustomer) {
      // Customer not found - ask user what to do
      context.conversationState = {
        ...state,
        waitingForCustomerChoice: true,
        parsedOrder: parsed,
        allCustomers: customers.data
      };

      return `找不到客戶「${parsed.customerName}」\n`
        + `\n請選擇：\n`
        + `1️⃣ 建立新客戶「${parsed.customerName}」\n`
        + `2️⃣ 重新輸入客戶名稱\n`
        + `3️⃣ 取消\n`
        + `\n請回覆 1、2 或 3`;
    }

    // Step 3: Build order data and show confirmation
    return buildOrderConfirmation(parsed, matchedCustomer, context);

  } catch (error) {
    console.error('[Order] Error:', error);
    return `系統錯誤：${error.message}\n請稍後再試。`;
  }
}

/**
 * Parse user message using Claude to extract order information
 */
async function parseOrderMessage(message, claudeApi) {
  // If claudeApi is available, use Claude for advanced parsing
  // Otherwise use simple regex parsing
  
  if (claudeApi && claudeApi.complete) {
    try {
      const response = await claudeApi.complete({
        prompt: `Parse this order message and extract order type, customer name, items, quantity, price, address, and notes.

Message: "${message}"

Return JSON with format:
{
  "orderType": "sales" or "purchase",
  "customerName": "customer name",
  "items": [{"name": "product code or name", "quantity": number, "price": number or 0}, ...],
  "address": "address or null",
  "note": "notes or null",
  "confidence": 0.0 to 1.0
}

Important rules:
- orderType: 含「採購」「採購單」「我要買」「買」「purchase」→ "purchase", 含「訂購」「下單」「我要訂」「建單」→ "sales"
- Product codes like PRO-183, PRO-456 are COMPLETE product codes. Do NOT split them. "PRO-183" is ONE item name, not "PRO-" and "183".
- Quantity formats: "x30", "×30", "數量30", "30個", "30" after product name → quantity: 30
- Price format: "ABC@500" or "ABC 單價500" → price: 500, if not specified → price: 0
- "百凌" or "百凌的" is a customer name, not a product

Only return valid JSON, no other text.`,
        max_tokens: 500
      });

      try {
        return JSON.parse(response);
      } catch (e) {
        // JSON parsing failed, fallback to simple parsing
        return simpleParseOrder(message);
      }
    } catch (error) {
      console.warn('[Order] Claude parsing failed, using simple parser:', error.message);
      return simpleParseOrder(message);
    }
  }

  return simpleParseOrder(message);
}

/**
 * Simple regex-based order parsing (fallback)
 */
function simpleParseOrder(message) {
  // Remove order command prefix
  let text = message.replace(/^\/order\s*/i, '').trim();
  
  if (!text) {
    return null;
  }

  // Detect order type first
  const purchaseKeywords = ['採購', '採購單', '我要買', '買', 'purchase'];
  const orderType = purchaseKeywords.some(kw => message.includes(kw)) ? 'purchase' : 'sales';

  // Extract items with improved patterns
  // Strategy: Try multiple patterns and combine results
  const items = [];
  let remainingText = text;
  const processedRanges = []; // Track matched text positions to avoid duplicates
  
  // Pattern 1: PRO-XXX format with quantity and optional price (most specific)
  // Examples: "PRO-183 數量30", "PRO-183 × 30", "PRO-183 x30@200", "PRO-183 30個"
  const proPattern = /(PRO-\d+)\s*(?:[x×]|數量)?\s*(\d+)(?:個)?(?:@(\d+))?/gi;
  let match;
  while ((match = proPattern.exec(text)) !== null) {
    items.push({
      name: match[1],
      quantity: parseInt(match[2]),
      price: match[3] ? parseInt(match[3]) : 0  // ← 解析 @price
    });
    processedRanges.push({ start: match.index, end: match.index + match[0].length });
    remainingText = remainingText.replace(match[0], ' '); // Replace with space to keep text structure
  }

  // Pattern 2: General product format "ProductName x Quantity @ Price"
  // Examples: "蘋果x5@100", "香蕉 × 3", "螺絲x10"
  // This pattern should NOT match text that was already matched by PRO- pattern
  const generalPattern = /([^\sx@,，\d]+)\s*[x×]\s*(\d+)(?:@(\d+))?/gi;
  remainingText = text; // Reset to original text
  while ((match = generalPattern.exec(text)) !== null) {
    // Check if this match overlaps with already processed PRO- ranges
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const overlaps = processedRanges.some(range => 
      (matchStart >= range.start && matchStart < range.end) ||
      (matchEnd > range.start && matchEnd <= range.end)
    );
    
    if (!overlaps) {
      const productName = match[1].trim();
      // Filter out noise words and very short names
      if (productName.length >= 2 && 
          !['我要', '給我', '幫我', '數量'].includes(productName) &&
          !items.find(i => i.name === productName)) {
        items.push({
          name: productName,
          quantity: parseInt(match[2]),
          price: match[3] ? parseInt(match[3]) : 0
        });
        processedRanges.push({ start: matchStart, end: matchEnd });
      }
    }
  }
  
  // Pattern 3: Fallback for "Quantity + Product" format
  // Examples: "30個蘋果", "5 香蕉"
  if (items.length === 0) {
    const qtyFirstPattern = /(\d+)\s*(?:個|件)?\s*([^\s,，\d]{2,})(?:@(\d+))?/gi;
    while ((match = qtyFirstPattern.exec(text)) !== null) {
      const productName = match[2].trim();
      if (!['我要', '給我', '幫我', '數量'].includes(productName)) {
        items.push({
          name: productName,
          quantity: parseInt(match[1]),
          price: match[3] ? parseInt(match[3]) : 0
        });
      }
    }
  }

  if (items.length === 0) {
    return null;
  }

  // Extract customer name (look for common customer indicators)
  let customerName = null;
  
  // Remove item text and common noise words
  const cleanText = remainingText
    .replace(/我要買|我要訂|下單|訂購|採購|給我|幫我/g, '')
    .replace(/採購單|銷售單|訂單/g, '')
    .trim();
  
  // Customer name is usually the remaining text (filter out very short strings)
  const customerMatch = cleanText.match(/([^\s,，]{2,}(?:公司|工业|股份|有限)?)/);
  if (customerMatch) {
    customerName = customerMatch[1].replace(/的$/, ''); // Remove trailing 的
  }

  return {
    orderType,
    customerName,
    items,
    address: null,
    note: null,
    confidence: 0.7
  };
}

/**
 * Find matching customer from ERP customer list
 */
/**
 * 本地二次驗證客戶匹配（後端已搜尋 name + taxId）
 * 此函數用於：
 * 1. 精確匹配客戶名稱
 * 2. 匹配聯絡人（後端不支援）
 * 3. 部分匹配（容錯）
 */
function findCustomer(searchName, customers) {
  if (!searchName || !Array.isArray(customers)) {
    return null;
  }

  const search = searchName.toLowerCase().trim();

  // 精確匹配客戶名稱
  let match = customers.find(c => c.name.toLowerCase() === search);
  if (match) return match;

  // 精確匹配聯絡人（後端 search API 不支援，由本地處理）
  match = customers.find(c => c.contact && c.contact.toLowerCase() === search);
  if (match) return match;

  // 部分匹配客戶名稱（容錯）
  match = customers.find(c => c.name.toLowerCase().includes(search) || search.includes(c.name.toLowerCase()));
  if (match) return match;

  // 如果後端已經搜尋過，但本地驗證都不匹配，直接取第一個結果
  // （後端可能用統編找到，但名稱不完全一樣）
  if (customers.length > 0) {
    console.log(`[Order] 使用後端搜尋結果第一筆: ${customers[0].name}`);
    return customers[0];
  }

  return null;
}

/**
 * Build order confirmation message
 */
function buildOrderConfirmation(parsedOrder, customer, context) {
  // Calculate total
  const totalAmount = parsedOrder.items.reduce((sum, item) => {
    return sum + (item.quantity * (item.price || 0));
  }, 0);

  // Build items summary with prices
  const itemsSummary = parsedOrder.items
    .map(i => {
      const priceInfo = i.price > 0 ? ` @ $${i.price}` : ' (價格未填)';
      const lineTotal = i.price > 0 ? ` = $${i.quantity * i.price}` : '';
      return `  • ${i.name} × ${i.quantity}${priceInfo}${lineTotal}`;
    })
    .join('\n');

  const address = parsedOrder.address || customer.address || 'Not specified';
  const paymentMethod = customer.payment?.method || '現金';

  const confirmMsg = `✅ 訂單確認\n`
    + `━━━━━━━━━━━━━━━━\n`
    + `👤 客戶：${customer.name} (${customer.customerCode || '無'})\n`
    + `📦 品項：\n${itemsSummary}\n`
    + `💰 總額：$${totalAmount}${totalAmount === 0 ? ' (待補價格)' : ''}\n`
    + `📍 地址：${address}\n`
    + `💳 付款：${paymentMethod}\n`
    + (parsedOrder.note ? `📝 備註：${parsedOrder.note}\n` : '')
    + `━━━━━━━━━━━━━━━━\n`
    + `請回覆「確認」以建立${parsedOrder.orderType === 'purchase' ? '採購單' : '銷售單'}，或「取消」`;

  // Store order data for next step
  context.conversationState = {
    ...(context.conversationState || {}),
    waitingForConfirmation: true,
    orderData: {
      parsedOrder,
      customerId: customer._id,
      customer
    }
  };

  return confirmMsg;
}

/**
 * Handle user confirmation (yes/no for order creation)
 */
async function handleConfirmation(message, state) {
  const response = message.toLowerCase().trim();

  if (response === 'confirm' || response === 'yes' || response === 'y' || response === '是' || response === '確認') {
    // Create order in ERP
    return createOrderInERP(state.orderData);
  } else if (response === 'cancel' || response === 'no' || response === 'n' || response === '否' || response === '取消') {
    return '訂單建立已取消。';
  } else {
    return '請回覆「確認」以建立訂單，或「取消」。';
  }
}

/**
 * Handle customer selection (create new / re-enter / cancel)
 */
async function handleCustomerChoice(message, state) {
  const choice = message.trim();

  if (choice === '1' || choice === '建立' || choice === 'create') {
    // Create new customer
    try {
      const newCustomer = await erpFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: state.parsedOrder.customerName,
          phone: state.parsedOrder.phone || '',
          type: 'customer',
          payment: { method: 'cash' }
        })
      });

      if (!newCustomer.success) {
        return `建立客戶失敗：${newCustomer.message}`;
      }

      console.log('[Order] New customer created:', newCustomer.data.customerCode);

      // Continue with order creation
      return buildOrderConfirmation(state.parsedOrder, newCustomer.data, state);

    } catch (error) {
      return `建立客戶時發生錯誤：${error.message}`;
    }

  } else if (choice === '2' || choice === '重新輸入' || choice === 'retry') {
    // Clear state and ask for customer name again
    delete state.waitingForCustomerChoice;
    return `請輸入正確的客戶名稱：`;

  } else if (choice === '3' || choice === '取消' || choice === 'cancel') {
    return '訂單建立已取消。';

  } else {
    return '請回覆：\n1️⃣ 建立新客戶\n2️⃣ 重新輸入客戶名稱\n3️⃣ 取消';
  }
}

/**
 * Create order in ERP system
 */
async function createOrderInERP(orderData) {
  try {
    const { parsedOrder, customer } = orderData;

    const orderPayload = {
      orderType: parsedOrder.orderType || 'sales',
      customerId: orderData.customerId,
      customerName: customer.name,
      customerPhone: customer.phone || parsedOrder.phone || '',
      shippingAddress: parsedOrder.address || customer.address || '',
      items: parsedOrder.items.map(item => ({
        productCode: item.name,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.price || 0  // Use parsed price or 0 if not specified
      })),
      paymentInfo: {
        method: customer.payment?.method || 'cash',
        isPaid: false,
        paidAmount: 0
      },
      notes: parsedOrder.note || ''
    };

    console.log('[Order] Creating order in ERP:', JSON.stringify(orderPayload, null, 2));

    const result = await erpFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });

    if (!result.success) {
      return `建立訂單失敗：${result.message || '未知錯誤'}`;
    }

    const orderNumber = result.data.orderNumber;
    const totalQty = parsedOrder.items.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmount = parsedOrder.items.reduce((sum, i) => sum + (i.quantity * (i.price || 0)), 0);
    
    const itemsList = parsedOrder.items
      .map(i => {
        const priceInfo = i.price > 0 ? ` @ $${i.price}` : '';
        return `  • ${i.name} × ${i.quantity}${priceInfo}`;
      })
      .join('\n');

    const typeName = parsedOrder.orderType === 'purchase' ? '採購單' : '銷售單';

    return `✅ ${typeName}建立成功！\n`
      + `━━━━━━━━━━━━━━━━\n`
      + `📋 訂單編號：${orderNumber}\n`
      + `👤 客戶：${customer.name}\n`
      + `📦 品項：\n${itemsList}\n`
      + `💰 總額：$${totalAmount}${totalAmount === 0 ? ' (待補價格)' : ''}\n`
      + `⏱️ 狀態：待處理\n`
      + `━━━━━━━━━━━━━━━━\n\n`
      + `📄 是否需要立即生成${typeName} PDF？回覆「是」即可生成`;

  } catch (error) {
    console.error('[Order] ERP creation error:', error);
    return `系統錯誤：${error.message}\n請聯絡客服。`;
  }
}

// ========================================
// Export
// ========================================

module.exports = {
  createOrder,
  parseOrderMessage,
  findCustomer,
  erpFetch,
  ensureAuthenticated
};
