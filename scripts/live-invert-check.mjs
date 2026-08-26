/**
 * Live verification of the INVERTED flow on the deployed site:
 * 1. Press 不同意 → the DISAGREE button dodges (transform changes); the AGREE
 *    button never moves (stays scale(1)) and remains clickable.
 * 2. Press 同意 → lands on the celebration screen immediately.
 * Usage: node scripts/live-invert-check.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'https://heye5857.github.io/invite-prank-webapp/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('editor-root').waitFor();

// Default config (all five modes, dodge first) straight from the editor.
await page.getByTestId('generate-link-btn').click();
const link = await page.getByTestId('share-link-output').inputValue();

const fp = await browser.newPage({ viewport: { width: 390, height: 844 } });
await fp.goto(link, { waitUntil: 'networkidle' });
await fp.getByTestId('intro-cta').click();

const agree = fp.getByTestId('btn-agree');
const disagree = fp.getByTestId('btn-disagree');

// 1. 不同意 press → disagree dodges, agree stays put.
const disagreeBefore = await disagree.evaluate((el) => el.style.transform);
const agreeBefore = await agree.evaluate((el) => el.style.transform);
await disagree.click();
const disagreeAfter = await disagree.evaluate((el) => el.style.transform);
const agreeAfter = await agree.evaluate((el) => el.style.transform);
if (disagreeAfter === disagreeBefore) throw new Error('disagree button did NOT dodge');
if (agreeAfter !== agreeBefore) throw new Error(`agree button moved: ${agreeBefore} -> ${agreeAfter}`);
console.log('DODGE_TARGET_OK (disagree dodges, agree stays)');

// 2. 同意 press → celebration screen immediately.
await agree.click();
await fp.getByTestId('success-title').waitFor({ timeout: 3000 });
const title = await fp.getByTestId('success-title').textContent();
if (!title?.includes('耶！約成功了')) throw new Error(`wrong success copy: ${title}`);
console.log('AGREE_SUCCESS_OK');
await fp.screenshot({ path: 'qa-artifacts/live-success-mobile.png', fullPage: true });
await browser.close();
