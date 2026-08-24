import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s3: broken payload shows friendly error screen', async ({ page }, testInfo) => {
  await page.goto('/#p=!!!');
  const err = page.getByTestId('error-screen');
  await expect(err).toBeVisible();
  await expect(err).toContainText('連結好像壞掉了');
  await page.screenshot({ path: `qa-artifacts/e2e/s3-error-${testInfo.project.name}.png` });
});
