#!/usr/bin/env node

/**
 * 品號格式識別規則
 * 
 * 根據你們 ERP 實際使用的品號格式，可以擴展這個配置
 */

export const PRODUCT_CODE_PATTERNS = [
  // === 完整支援的格式 ===
  
  {
    name: 'PRO-數字',
    pattern: /\b(PRO-\d+)\b/gi,
    example: 'PRO-183',
    priority: 1,  // 優先級（數字越小越優先）
    extract: (match) => ({
      productCode: match[1],
      confidence: 1.0
    })
  },

  // === 可擴展的格式（根據實際情況調整） ===

  {
    name: '英文-數字',
    pattern: /\b([A-Z]{2,4}-\d{3,6})\b/gi,
    example: 'ABC-12345, TEMP-001',
    priority: 2,
    extract: (match) => ({
      productCode: match[1],
      confidence: 0.9
    })
  },

  {
    name: '純數字品號',
    pattern: /\b品號[：:\s]*(\d{4,8})\b/gi,
    example: '品號: 12345678',
    priority: 3,
    extract: (match) => ({
      productCode: match[1],
      confidence: 0.8
    })
  },

  {
    name: '英數混合',
    pattern: /\b([A-Z0-9]{6,12})\b/gi,
    example: 'ABC123XYZ',
    priority: 5,
    extract: (match) => ({
      productCode: match[1],
      confidence: 0.6
    })
  },

  {
    name: '中文品號',
    pattern: /品號[：:\s]*([\u4e00-\u9fa5A-Z0-9\-]{2,20})/gi,
    example: '品號: 控制器-A型',
    priority: 4,
    extract: (match) => ({
      productCode: match[1],
      confidence: 0.7
    })
  },

  // === 特殊格式（供應商專用） ===

  {
    name: '百凌品號',
    pattern: /\b(BL-\d{4})\b/gi,
    example: 'BL-1234',
    priority: 1,
    supplier: '百凌工业股份有限公司',
    extract: (match) => ({
      productCode: match[1],
      supplier: '百凌工业股份有限公司',
      confidence: 1.0
    })
  }
];

/**
 * 從文字中提取品號
 */
export function extractProductCodes(text) {
  const results = [];
  const seen = new Set();

  // 按優先級排序
  const sortedPatterns = [...PRODUCT_CODE_PATTERNS].sort((a, b) => a.priority - b.priority);

  for (const pattern of sortedPatterns) {
    let match;
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      const extracted = pattern.extract(match);
      const code = extracted.productCode;

      // 避免重複
      if (!seen.has(code)) {
        seen.add(code);
        results.push({
          ...extracted,
          patternName: pattern.name,
          matchedText: match[0]
        });
      }
    }
  }

  return results;
}

/**
 * 驗證品號格式
 */
export function validateProductCode(code) {
  // 檢查是否符合任一已知格式
  for (const pattern of PRODUCT_CODE_PATTERNS) {
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    if (regex.test(code)) {
      return {
        valid: true,
        pattern: pattern.name,
        confidence: pattern.priority <= 2 ? 'high' : 'medium'
      };
    }
  }

  return {
    valid: false,
    reason: '不符合已知品號格式'
  };
}

/**
 * 智能品號清理
 */
export function cleanProductCode(code) {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^\w\-\u4e00-\u9fa5]/g, '');  // 保留英數字、中文、連字號
}

// CLI 測試
if (import.meta.url === `file://${process.argv[1]}`) {
  const testText = `
    百凌工业股份有限公司報價單
    
    品項明細:
    1. PRO-183 工業控制器 數量30
    2. BL-1234 溫度傳感器 數量10
    3. 品號: ABC-12345 壓力計 數量5
    4. TEMP-001 溫度計 數量20
  `;

  console.log('=== 品號提取測試 ===\n');
  const codes = extractProductCodes(testText);
  
  codes.forEach((result, idx) => {
    console.log(`${idx + 1}. ${result.productCode}`);
    console.log(`   格式: ${result.patternName}`);
    console.log(`   信心度: ${result.confidence}`);
    console.log(`   原文: "${result.matchedText}"`);
    console.log();
  });

  console.log('=== 品號驗證測試 ===\n');
  const testCodes = ['PRO-183', 'ABC-12345', 'invalid123', 'BL-1234'];
  testCodes.forEach(code => {
    const result = validateProductCode(code);
    console.log(`${code}: ${result.valid ? '✅' : '❌'} ${result.valid ? result.pattern : result.reason}`);
  });
}
