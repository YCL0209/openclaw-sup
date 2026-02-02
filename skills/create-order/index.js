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
const ERP_TAX_ID = process.env.ERP_TAX_ID || '12345678';
const ERP_BOT_EMAIL = process.env.ERP_BOT_EMAIL || 'bot@yourcompany.com';
const ERP_BOT_PASSWORD = process.env.ERP_BOT_PASSWORD || '';

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

    console.log('[Order] Parsed order:', JSON.stringify(parsed, null, 2));

    // Step 2: Query customer from ERP
    console.log('[Order] Querying customer:', parsed.customerName);
    const customers = await erpFetch('/api/customers');
    
    if (!customers.success) {
      return '無法連接 ERP 系統。請稍後再試。';
    }

    const matchedCustomer = findCustomer(parsed.customerName, customers.data);

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
        prompt: `Parse this order message and extract customer name, items, quantity, price, address, and notes.
        
Message: "${message}"

Return JSON with format:
{
  "customerName": "customer name",
  "items": [{"name": "product name", "quantity": number, "price": number or 0}, ...],
  "address": "address or null",
  "note": "notes or null",
  "confidence": 0.0 to 1.0
}

Price format examples:
- "ABC電線x1@500" → price: 500
- "ABC電線x1" → price: 0 (not specified)

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

  // Try to extract customer name (usually first few words before items)
  // and items (patterns with optional price: "product x2@500" or "product x2" or "product 2")
  
  const items = [];
  const itemPatterns = [
    /([^x@,，]*?)x(\d+)(?:@(\d+))?/gi,           // A产品x2@500 or A产品x2
    /(\d+)\s*(?:个)?([^,，\d@]+)(?:@(\d+))?/gi,  // 2个A产品@500 or 2个A产品
    /([^,，\d@]+?)\s*(\d+)(?:@(\d+))?/gi         // A产品 2@500 or A产品 2
  ];

  let itemsText = text;
  
  for (const pattern of itemPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const product = match[1]?.trim() || match[2]?.trim();
      const qty = parseInt(match[2] || match[match.length - 2]);
      const price = match[3] ? parseInt(match[3]) : 0;
      
      if (product && !isNaN(qty) && qty > 0) {
        // Check if not already added
        if (!items.find(i => i.name.toLowerCase() === product.toLowerCase())) {
          items.push({ 
            name: product, 
            quantity: qty,
            price: price || 0
          });
          itemsText = itemsText.replace(match[0], '');
        }
      }
    }
  }

  if (items.length === 0) {
    return null;
  }

  // Extract customer name (remaining text before first item or comma)
  const parts = itemsText.split(/[,，]/);
  const customerName = parts[0]?.trim() || null;

  // Extract address and notes (usually after items)
  const address = null; // TODO: improve address extraction
  const note = null;

  return {
    customerName,
    items,
    address,
    note,
    confidence: 0.7
  };
}

/**
 * Find matching customer from ERP customer list
 */
function findCustomer(searchName, customers) {
  if (!searchName || !Array.isArray(customers)) {
    return null;
  }

  const search = searchName.toLowerCase().trim();

  // Exact match on name
  let match = customers.find(c => c.name.toLowerCase() === search);
  if (match) return match;

  // Exact match on contact person
  match = customers.find(c => c.contact && c.contact.toLowerCase() === search);
  if (match) return match;

  // Partial match on name
  match = customers.find(c => c.name.toLowerCase().includes(search) || search.includes(c.name.toLowerCase()));
  if (match) return match;

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
    + `請回覆「確認」以建立訂單，或「取消」`;

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
      orderType: 'sales',
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

    return `✅ 訂單建立成功！\n`
      + `━━━━━━━━━━━━━━━━\n`
      + `📋 訂單編號：${orderNumber}\n`
      + `👤 客戶：${customer.name}\n`
      + `📦 品項：\n${itemsList}\n`
      + `💰 總額：$${totalAmount}${totalAmount === 0 ? ' (待補價格)' : ''}\n`
      + `⏱️ 狀態：待處理\n`
      + `━━━━━━━━━━━━━━━━\n\n`
      + `💡 提示：如需報價單，請使用「生成報價單 ${orderNumber}」`;

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
