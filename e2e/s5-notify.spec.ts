import { mkdirSync } from 'node:fs';

import { expect, test, type Request } from '@playwright/test';

import { encodeConfig } from '../src/lib/codec';
import { DEFAULT_CONFIG } from '../src/defaults';
import type { InviteConfig } from '../src/types';

mkdirSync('qa-artifacts/e2e', { recursive: true });

test('s5: ntfy opened() on mount + agreeAttempt with tags=warning (route-mocked)', async ({
  page,
}, testInfo) => {
  const requests: Request[] = [];
  await page.route('**ntfy.sh/**', (route) => {
    requests.push(route.request());
    void route.fulfill({ status: 200, body: 'OK' });
  });

  const cfg: InviteConfig = {
    ...DEFAULT_CONFIG,
    notify: { enabled: true, topic: 'e2e-topic-123' },
  };

  await page.goto(`/#p=${encodeConfig(cfg)}`);

  // opened() fires on mount
  await expect.poll(() => requests.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
  const opened = requests[requests.length - 1];
  expect(opened.method()).toBe('POST');
  expect(opened.url()).toContain('/e2e-topic-123');
  expect(opened.postData() ?? '').toContain('朋友打開了你的邀請');

  // agreeAttempt publishes immediately on first press
  await page.getByTestId('intro-cta').click();
  await page.getByTestId('btn-agree').click();
  await expect
    .poll(() => requests.some((r) => r.url().includes('tags=warning')), { timeout: 5000 })
    .toBe(true);

  await page.screenshot({ path: `qa-artifacts/e2e/s5-notify-${testInfo.project.name}.png` });
});
