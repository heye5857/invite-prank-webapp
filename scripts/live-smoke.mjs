/**
 * Live-site smoke test: proves the exact user flow that was broken —
 * generate an invite link on the DEPLOYED site and open it as a friend would.
 * Usage: node scripts/live-smoke.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'https://heye5857.github.io/invite-prank-webapp/';
mkdirSync('qa-artifacts', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
});
page.on('requestfailed', (r) => {
  problems.push(`requestfailed: ${r.url()}`);
});

// 1. Editor loads on the live site (assets + JS bundle OK on the /subpath)
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByTestId('editor-root').waitFor({ timeout: 15_000 });

// 2. Sender customizes and generates the share link ON the live origin
await page.getByLabel('開場標題').fill('現場部署測試XYZ');
await page.getByTestId('generate-link-btn').click();
const link = await page.getByTestId('share-link-output').inputValue();
if (!link.startsWith(`${BASE}#p=`)) {
  throw new Error(`generated link has wrong origin: ${link}`);
}

// 3. Friend opens the generated link in a FRESH page (cold navigation)
const friendPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
friendPage.on('requestfailed', (r) => problems.push(`friend requestfailed: ${r.url()}`));
await friendPage.goto(link, { waitUntil: 'networkidle' });
await friendPage.getByTestId('intro-title').waitFor({ timeout: 15_000 });
const title = await friendPage.getByTestId('intro-title').textContent();
if (!title?.includes('現場部署測試XYZ')) {
  throw new Error(`friend saw wrong title: ${title}`);
}
await friendPage.screenshot({ path: 'qa-artifacts/live-invite-mobile.png', fullPage: true });

console.log('LIVE_SMOKE_OK');
console.log(`LINK=${link}`);
console.log(`PROBLEMS=${problems.length}`);
problems.slice(0, 5).forEach((p) => console.log(`  ${p}`));
await browser.close();
