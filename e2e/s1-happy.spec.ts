import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { encodeConfig } from '../src/lib/codec';
import { DEFAULT_CONFIG } from '../src/defaults';
import type { InviteConfig } from '../src/types';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s1: happy path — intro, question, 同意 lands on the celebration screen', async ({
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

  // Inverted contract: 同意 succeeds IMMEDIATELY — no gag, straight to success.
  await page.getByTestId('btn-agree').click();
  const successTitle = page.getByTestId('success-title');
  await expect(successTitle).toBeVisible();
  await expect(successTitle).toContainText('耶！約成功了'); // DEFAULT success.title
  await expect(page.getByTestId('success-emoji')).toContainText(DEFAULT_CONFIG.success.emoji);
  await page.screenshot({ path: `qa-artifacts/e2e/s1-success-${testInfo.project.name}.png` });
});
