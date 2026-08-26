import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { encodeConfig } from '../src/lib/codec';
import { DEFAULT_CONFIG } from '../src/defaults';
import type { InviteConfig } from '../src/types';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s2: gag engine on 不同意 — fakeErrors cycles then fakeLoad auto-dismisses; 同意 is the escape hatch', async ({
  page,
}, testInfo) => {
  const cfg: InviteConfig = {
    ...DEFAULT_CONFIG,
    gag: {
      ...DEFAULT_CONFIG.gag,
      modes: ['fakeErrors', 'fakeLoad'],
      dodge: { times: 2 },
      errors: { messages: ['錯誤A', '錯誤B'] },
      milestones: { everyN: 99, messages: [] },
    },
  };
  const payload = encodeConfig(cfg);

  await page.goto(`/#p=${payload}`);
  await page.getByTestId('intro-cta').click();
  const disagree = page.getByTestId('btn-disagree');
  const toast = page.getByTestId('gag-overlay-toast');

  // Press 1 -> fakeErrors step 0
  await disagree.click();
  await expect(toast).toContainText('錯誤A');
  await page.screenshot({ path: `qa-artifacts/e2e/s2-error-a-${testInfo.project.name}.png` });

  // Press 2 -> fakeErrors step 1
  await disagree.click();
  await expect(toast).toContainText('錯誤B');

  // Press 3 -> budget (dodge.times=2) exhausted, falls through to fakeLoad
  const loading = page.getByTestId('gag-overlay-loading');
  await disagree.click();
  await expect(loading).toBeVisible();

  // fakeLoad.delayMs (2200ms) elapses -> loading disappears, fail toast auto-shows
  await expect(toast).toContainText('提交失敗', { timeout: 5000 });
  await expect(loading).not.toBeVisible();

  // 不同意 NEVER succeeds: question still up, prank button still pressable.
  await expect(page.getByTestId('question-text')).toBeVisible();
  await expect(disagree).toBeEnabled();
  await page.screenshot({ path: `qa-artifacts/e2e/s2-fakeload-${testInfo.project.name}.png` });

  // Escape hatch: 同意 always works and reaches the celebration screen.
  await page.getByTestId('btn-agree').click();
  await expect(page.getByTestId('success-title')).toContainText('耶！約成功了');
});
