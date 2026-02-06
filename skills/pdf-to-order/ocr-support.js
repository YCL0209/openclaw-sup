#!/usr/bin/env node

/**
 * OCR 支援（圖片型 PDF）
 * 
 * 使用 Tesseract OCR 處理掃描件或圖片型 PDF
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * 檢查 OCR 工具是否已安裝
 */
export async function checkOcrTools() {
  const tools = {
    tesseract: false,
    poppler: false,    // pdftoppm (PDF 轉圖片)
    imagemagick: false // convert (圖片處理)
  };

  try {
    await execAsync('tesseract --version');
    tools.tesseract = true;
  } catch (e) {
    // Not installed
  }

  try {
    await execAsync('pdftoppm -v');
    tools.poppler = true;
  } catch (e) {
    // Not installed
  }

  try {
    await execAsync('convert --version');
    tools.imagemagick = true;
  } catch (e) {
    // Not installed
  }

  return tools;
}

/**
 * 判斷 PDF 是否為圖片型
 */
export async function isPdfImageBased(pdfPath) {
  try {
    const { stdout } = await execAsync(`pdftotext "${pdfPath}" -`);
    const textLength = stdout.trim().length;
    
    // 如果提取的文字少於 50 個字元，可能是圖片型
    return textLength < 50;
  } catch (error) {
    return true; // 提取失敗，假設是圖片型
  }
}

/**
 * 使用 OCR 處理圖片型 PDF
 */
export async function extractTextWithOcr(pdfPath, options = {}) {
  const {
    language = 'chi_tra+eng',  // 繁體中文 + 英文
    outputDir = '/tmp/pdf-ocr',
    dpi = 300                   // 解析度
  } = options;

  console.log('[OCR] 開始處理圖片型 PDF...');

  // 1. 確保輸出目錄存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 2. PDF 轉圖片 (使用 pdftoppm)
    console.log('[OCR] 步驟 1/3: 轉換 PDF 為圖片...');
    const imagePrefix = join(outputDir, 'page');
    await execAsync(`pdftoppm -png -r ${dpi} "${pdfPath}" "${imagePrefix}"`);

    // 3. 對每頁圖片執行 OCR
    console.log('[OCR] 步驟 2/3: 執行 OCR...');
    const { stdout: lsOutput } = await execAsync(`ls "${outputDir}"/page-*.png`);
    const imageFiles = lsOutput.trim().split('\n');

    let allText = '';
    for (const imageFile of imageFiles) {
      console.log(`[OCR] 處理: ${imageFile}`);
      const { stdout } = await execAsync(
        `tesseract "${imageFile}" stdout -l ${language} --psm 6`
      );
      allText += stdout + '\n';
    }

    console.log('[OCR] 步驟 3/3: 完成！');
    console.log(`[OCR] 提取文字長度: ${allText.length} 字元`);

    // 4. 清理臨時圖片（可選）
    // await execAsync(`rm -f "${outputDir}"/page-*.png`);

    return {
      success: true,
      text: allText,
      method: 'tesseract-ocr',
      pages: imageFiles.length
    };

  } catch (error) {
    console.error('[OCR] 錯誤:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 智能文字提取（自動判斷類型）
 */
export async function smartExtractText(pdfPath) {
  console.log('[Smart Extract] 分析 PDF 類型...');

  // 1. 先嘗試直接提取
  try {
    const { stdout } = await execAsync(`pdftotext "${pdfPath}" -`);
    if (stdout.trim().length > 50) {
      console.log('[Smart Extract] ✅ 文字型 PDF，使用 pdftotext');
      return {
        success: true,
        text: stdout,
        method: 'pdftotext',
        type: 'text-based'
      };
    }
  } catch (error) {
    console.log('[Smart Extract] pdftotext 失敗，嘗試 OCR...');
  }

  // 2. 如果直接提取失敗或文字太少，使用 OCR
  console.log('[Smart Extract] ⚠️ 圖片型 PDF，使用 OCR');
  
  const tools = await checkOcrTools();
  if (!tools.tesseract || !tools.poppler) {
    return {
      success: false,
      error: 'OCR 工具未安裝',
      missingTools: {
        tesseract: !tools.tesseract,
        poppler: !tools.poppler
      },
      installHint: 'brew install tesseract tesseract-lang poppler'
    };
  }

  return await extractTextWithOcr(pdfPath);
}

// CLI 測試
if (import.meta.url === `file://${process.argv[1]}`) {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.log('用法: node ocr-support.js <pdf-file>');
    console.log('\n檢查 OCR 工具安裝狀態...');
    
    checkOcrTools().then(tools => {
      console.log('\n=== OCR 工具狀態 ===');
      console.log(`Tesseract OCR: ${tools.tesseract ? '✅ 已安裝' : '❌ 未安裝'}`);
      console.log(`Poppler (pdftoppm): ${tools.poppler ? '✅ 已安裝' : '❌ 未安裝'}`);
      console.log(`ImageMagick: ${tools.imagemagick ? '✅ 已安裝' : '❌ 未安裝'}`);
      
      if (!tools.tesseract || !tools.poppler) {
        console.log('\n安裝指令:');
        console.log('brew install tesseract tesseract-lang poppler');
      }
    });
    
    process.exit(0);
  }

  console.log('=== PDF 文字提取測試 ===\n');
  
  smartExtractText(pdfPath).then(result => {
    if (result.success) {
      console.log(`\n✅ 提取成功！`);
      console.log(`方法: ${result.method}`);
      console.log(`類型: ${result.type || 'image-based'}`);
      console.log(`文字長度: ${result.text.length} 字元`);
      console.log('\n前 500 字元:');
      console.log('━━━━━━━━━━━━━━━━━━━━');
      console.log(result.text.substring(0, 500));
      console.log('━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log(`\n❌ 提取失敗: ${result.error}`);
      if (result.installHint) {
        console.log(`\n安裝提示: ${result.installHint}`);
      }
    }
  });
}
