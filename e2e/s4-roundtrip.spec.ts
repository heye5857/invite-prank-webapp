import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s4: editor → share link → invite roundtrip via hashchange', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('editor-root')).toBeVisible();

  await page.getByLabel('開場標題').fill('S4往返測試XYZ');
  await page.getByTestId('generate-link-btn').click();

  const url = await page.getByTestId('share-link-output').inputValue();
  expect(url).toContain('#p=');

  // Same-tab navigation; hashchange listener switches to the invite view.
  await page.goto(url);
  await expect(page.getByTestId('intro-title')).toHaveText('S4往返測試XYZ');
  await page.screenshot({ path: 'qa-artifacts/e2e/s4-invite.png' });
});
