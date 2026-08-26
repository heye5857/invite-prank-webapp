/**
 * Full-flow live reproduction: change EVERY editor section, generate, then walk
 * the complete friend flow on a fresh page and assert each customization shows.
 * Usage: node scripts/live-repro.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'https://heye5857.github.io/invite-prank-webapp/';
mkdirSync('qa-artifacts/repro', { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', (r) => problems.push(`reqfail ${r.url()}`));

// ---- 1. editor: change every section ----
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('editor-root').waitFor();

await page.getByLabel('開場標題').fill('客製標題ABC');
await page.getByLabel('提問文字').fill('客製提問XYZ?');
await page.getByLabel('同意按鈕文字', { exact: true }).fill('好啦同意Q');
await page.getByLabel('不同意按鈕文字', { exact: true }).fill('不要啦!');
// accent color (playwright fill supports color inputs)
await page.getByLabel('強調色').fill('#ff0000');
// gag: uncheck everything, keep only fakeErrors with a custom message
for (const label of ['逃跑按鈕', '搞笑錯誤', '假載入失敗', '同意縮小', '確認轉圈圈']) {
  await page.getByRole('checkbox', { name: label }).uncheck();
}
await page.getByRole('checkbox', { name: '搞笑錯誤' }).check();
await page.getByLabel('錯誤訊息（一行一句）').fill('客製錯誤一號\n客製錯誤二號');
// disagree step 1 + final
await page.getByLabel('第 1 段說明文字').fill('客製哀求文字');
await page.getByLabel('最終標題').fill('客製結局標題');

await page.getByTestId('generate-link-btn').click();
const link = await page.getByTestId('share-link-output').inputValue();
await page.screenshot({ path: 'qa-artifacts/repro/1-editor.png', fullPage: true });

// ---- 2. friend opens in a FRESH page ----
const fp = await browser.newPage({ viewport: { width: 390, height: 844 } });
await fp.goto(link, { waitUntil: 'networkidle' });

// intro
await fp.getByTestId('intro-title').waitFor();
check('intro title 客製', (await fp.getByTestId('intro-title').textContent())?.includes('客製標題ABC') ?? false);
await fp.screenshot({ path: 'qa-artifacts/repro/2-intro.png' });

// question
await fp.getByTestId('intro-cta').click();
check('question text 客製', (await fp.getByTestId('question-text').textContent())?.includes('客製提問XYZ') ?? false);
const agreeText = await fp.getByTestId('btn-agree').textContent();
check('agree label 客製', agreeText?.includes('好啦同意Q') ?? false, agreeText ?? '');
const accent = await fp.getByTestId('btn-agree').evaluate((el) => getComputedStyle(el).backgroundColor);
check('accent color 客製(紅)', accent === 'rgb(255, 0, 0)', accent);
await fp.screenshot({ path: 'qa-artifacts/repro/3-question.png' });

// gag: fakeErrors custom message
await fp.getByTestId('btn-agree').click();
const toast = await fp.getByTestId('gag-overlay-toast').textContent();
check('gag toast 客製', toast?.includes('客製錯誤一號') ?? false, toast ?? '');
await fp.screenshot({ path: 'qa-artifacts/repro/4-toast.png' });

// disagree flow
await fp.getByTestId('btn-disagree').click();
check('disagree step 客製', (await fp.getByTestId('disagree-step-text').textContent())?.includes('客製哀求文字') ?? false);
await fp.getByTestId('disagree-next-btn').click();
await fp.getByTestId('disagree-next-btn').click();
await fp.getByTestId('disagree-next-btn').click();
check('final title 客製', (await fp.getByTestId('final-title').textContent())?.includes('客製結局標題') ?? false);
await fp.screenshot({ path: 'qa-artifacts/repro/5-final.png' });

// ---- report ----
console.log('=== REPRO RESULTS ===');
results.forEach((r) => console.log(r));
console.log(`CONSOLE_PROBLEMS=${problems.length}`);
problems.slice(0, 5).forEach((p) => console.log(`  ${p}`));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(failed === 0 ? 'ALL_CUSTOMIZATIONS_APPLY' : `${failed} FAILED`);
await browser.close();
