/**
 * Live check for the stale-link fix: after the first reveal, editing settings
 * must update the share link WITHOUT clicking generate again.
 * Usage: node scripts/live-autoupdate.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'https://heye5857.github.io/invite-prank-webapp/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('editor-root').waitFor();

// Reveal the link once.
await page.getByTestId('generate-link-btn').click();
const first = await page.getByTestId('share-link-output').inputValue();

// Change settings WITHOUT clicking generate again.
await page.getByLabel('開場標題').fill('不按按鈕也會更新QQ');
await page.waitForTimeout(300);
const second = await page.getByTestId('share-link-output').inputValue();

if (second === first) throw new Error('STALE LINK — auto-update NOT working');
if (!second.includes('#p=')) throw new Error(`bad link: ${second}`);
console.log('AUTO_UPDATE_OK');

// The refreshed link must open with the NEW title in a fresh page.
const fp = await browser.newPage({ viewport: { width: 390, height: 844 } });
await fp.goto(second, { waitUntil: 'networkidle' });
await fp.getByTestId('intro-title').waitFor();
const title = await fp.getByTestId('intro-title').textContent();
if (!title?.includes('不按按鈕也會更新QQ')) throw new Error(`stale content: ${title}`);
console.log('FRESH_CONTENT_OK');
console.log(`LINK=${second}`);
await browser.close();
