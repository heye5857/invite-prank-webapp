import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { encodeConfig } from '../src/lib/codec';
import { DEFAULT_CONFIG } from '../src/defaults';
import type { InviteConfig } from '../src/types';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s1: happy path — intro, question, agree proves gag interaction alive', async ({
  page,
}, testInfo) => {
  const cfg: InviteConfig = {
    ...DEFAULT_CONFIG,
    intro: { ...DEFAULT_CONFIG.intro, title: '週末來爬山好嗎🥺' },
    question: { ...DEFAULT_CONFIG.question, text: '這週六要不要一起去看海？' },
  };
  const payload = encodeConfig(cfg);

  await page.goto(`/#p=${payload}`);
  await expect(page.getByTestId('invite-root')).toBeVisible();
  await expect(page.getByTestId('intro-title')).toContainText('週末來爬山');
  await page.screenshot({ path: `qa-artifacts/e2e/s1-intro-${testInfo.project.name}.png` });

  await page.getByTestId('intro-cta').click();
  await expect(page.getByTestId('question-text')).toContainText('這週六');

  // Engine contract: every mode visit gets dodge.times(=3) presses before
  // falling through, and DEFAULT_CONFIG.modes[0] is 'dodge'. So presses 1-3
  // are eaten by dodge; press 4 reaches fakeErrors step 0 -> its first toast.
  const agree = page.getByTestId('btn-agree');
  for (let i = 0; i < 4; i += 1) {
    try {
      await agree.click({ timeout: 2500 });
    } catch {
      // Dodge can park the button beneath btn-disagree on narrow viewports,
      // making a real pointer click impossible by design; fire the handler.
      await agree.dispatchEvent('click');
    }
  }
  const toast = page.getByTestId('gag-overlay-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('系統繁忙中'); // errors.messages[0]
});
