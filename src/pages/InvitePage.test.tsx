import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../defaults';
import { encodeConfig } from '../lib/codec';
import InvitePage from './InvitePage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvitePage — decode failure', () => {
  it('shows the friendly error screen for a garbage payload', () => {
    render(<InvitePage payload="!!!not-a-real-payload!!!" />);

    const err = screen.getByTestId('error-screen');
    expect(err).toHaveTextContent('連結好像壞掉了 🥲');
    // Title + hint: two paragraphs, so the hint is present without pinning its prose.
    expect(err.querySelectorAll('p').length).toBeGreaterThanOrEqual(2);
  });
});

describe('InvitePage — decode success', () => {
  it('renders the invite intro title for a valid payload', () => {
    render(<InvitePage payload={encodeConfig(DEFAULT_CONFIG)} />);
    expect(screen.getByTestId('intro-title')).toHaveTextContent(DEFAULT_CONFIG.intro.title);
  });

  it('fires notifier.opened once on mount and agreed flows through on 同意 press', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => ({ catch: () => undefined }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <InvitePage
        payload={encodeConfig({
          ...DEFAULT_CONFIG,
          notify: { enabled: true, topic: 'test-topic-123' },
        })}
      />,
    );

    // opened fires exactly once on mount (ntfy publish = one fetch).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://ntfy.sh/test-topic-123');

    await user.click(screen.getByTestId('intro-cta'));
    await user.click(screen.getByTestId('btn-agree'));

    // agreed() is the payoff event: published immediately, never throttled.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
