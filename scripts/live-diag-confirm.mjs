/**
 * Diagnostic recipe A: single gag mode (confirmLoop) end-to-end on LIVE.
 * Uncheck everything except 確認轉圈圈 → generate → fresh page → first agree
 * press MUST pop the confirm modal immediately.
 * Usage: node scripts/live-diag-confirm.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'https://heye5857.github.io/invite-prank-webapp/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('editor-root').waitFor();

// Only 確認轉圈圈 stays checked.
for (const label of ['逃跑按鈕', '搞笑錯誤', '假載入失敗', '同意縮小', '確認轉圈圈']) {
  await page.getByRole('checkbox', { name: label }).uncheck();
}
await page.getByRole('checkbox', { name: '確認轉圈圈' }).check();
await page.getByTestId('generate-link-btn').click();
const link = await page.getByTestId('share-link-output').inputValue();
console.log('STEP1_EDITOR_OK');

const fp = await browser.newPage({ viewport: { width: 390, height: 844 } });
await fp.goto(link, { waitUntil: 'networkidle' });
await fp.getByTestId('intro-cta').waitFor();
await fp.getByTestId('intro-cta').click();
await fp.getByTestId('btn-agree').waitFor();
await fp.getByTestId('btn-agree').click();
await fp.getByTestId('gag-modal-confirm').waitFor({ timeout: 3000 });
const prompt = await fp.getByTestId('gag-modal-confirm').textContent();
console.log(`STEP2_FRIEND_MODAL_OK prompt=${prompt?.trim()}`);
await fp.screenshot({ path: 'qa-artifacts/diag-confirm.png' });
await browser.close();
