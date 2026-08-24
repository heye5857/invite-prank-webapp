import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s6: preset accent propagates from editor preview to invite page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('editor-root')).toBeVisible();

  await page.getByRole('button', { name: '蜜桃粉' }).click();
  const previewInvRoot = page.getByTestId('preview-invite-root');
  const previewAccent = await previewInvRoot.evaluate((el) =>
    el.style.getPropertyValue('--inv-accent'),
  );
  expect(previewAccent).toBe('#f43f5e');

  await page.getByLabel('開場標題').fill('S6主題測試ABC');
  await page.getByTestId('generate-link-btn').click();
  const url = await page.getByTestId('share-link-output').inputValue();

  await page.goto(url);
  const inviteRoot = page.getByTestId('invite-root');
  await expect(inviteRoot).toBeVisible();
  const inviteAccent = await inviteRoot.evaluate((el) =>
    el.style.getPropertyValue('--inv-accent'),
  );
  expect(inviteAccent).toBe('#f43f5e');
  expect(inviteAccent).toBe(previewAccent);

  await page.screenshot({ path: 'qa-artifacts/e2e/s6.png' });
});
