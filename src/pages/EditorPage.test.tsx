/**
 * EditorPage (T7) tests. jsdom constraints honored:
 * - never assert QR canvas pixels (canvas unimplemented) — container presence only;
 * - never mock navigator.share or assert share invocation (case m asserts absence);
 * - topic generation goes through lib/uuid generateUuid (jsdom-safe).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../defaults';
import { decodeConfig } from '../lib/codec';
import EditorPage from './EditorPage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seedDraft(title: string): void {
  const draft = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as typeof DEFAULT_CONFIG;
  draft.intro.title = title;
  localStorage.setItem('invite-draft', JSON.stringify(draft));
}

/** Extract the `#p=` payload suffix from a generated share link. */
function payloadOf(link: string): string {
  const idx = link.indexOf('#p=');
  expect(idx).toBeGreaterThanOrEqual(0);
  return link.slice(idx + '#p='.length);
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('EditorPage — layout', () => {
  it('renders editor-root with all six section headings visible', () => {
    render(<EditorPage />);
    expect(screen.getByTestId('editor-root')).toBeInTheDocument();
    for (const heading of ['主題', '開場頁', '提問頁', '整人手法', '不同意流程', '通知']) {
      expect(screen.getByRole('heading', { name: new RegExp(heading) })).toBeInTheDocument();
    }
  });

  it('typing intro title updates the phone-frame preview copy', async () => {
    const user = userEvent.setup();
    render(<EditorPage />);
    const preview = screen.getByTestId('preview-invite-root');
    await user.type(screen.getByLabelText('開場標題'), 'abc');
    expect(within(preview).getByTestId('intro-title')).toHaveTextContent('有一件事想跟你說abc');
  });

  it('clicking a preset swaps the accent color input and preview CSS var', async () => {
    const user = userEvent.setup();
    render(<EditorPage />);
    await user.click(screen.getByRole('button', { name: '蜜桃粉' }));
    expect(screen.getByLabelText('強調色')).toHaveValue('#f43f5e');
    const preview = screen.getByTestId('preview-invite-root');
    expect(preview.style.getPropertyValue('--inv-accent')).toBe('#f43f5e');
  });
});

describe('EditorPage — gag modes', () => {
  it('modes toggle in click order; unchecking removes and renumbers chips', async () => {
    const user = userEvent.setup();
    render(<EditorPage />);

    // DEFAULT enables all five — clear them first so click order is observable.
    for (const label of ['逃跑按鈕', '搞笑錯誤', '假載入失敗', '同意縮小', '確認轉圈圈']) {
      await user.click(screen.getByRole('checkbox', { name: label }));
    }
    expect(screen.queryByTestId(/^mode-chip-/)).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: '搞笑錯誤' }));
    await user.click(screen.getByRole('checkbox', { name: '逃跑按鈕' }));

    const chips = screen.getAllByTestId(/^mode-chip-/);
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('1');
    expect(chips[0]).toHaveTextContent('搞笑錯誤');
    expect(chips[1]).toHaveTextContent('2');
    expect(chips[1]).toHaveTextContent('逃跑按鈕');

    await user.click(screen.getByRole('checkbox', { name: '搞笑錯誤' }));
    const remaining = screen.getAllByTestId(/^mode-chip-/);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent('逃跑按鈕');
    expect(remaining[0]).toHaveTextContent('1');
  });

  it('errors.messages textarea splits by newline into the generated payload', async () => {
    const user = userEvent.setup();
    render(<EditorPage />);
    fireEvent.change(screen.getByLabelText('錯誤訊息（一行一句）'), {
      target: { value: '哈\n嘿\n呵' },
    });
    await user.click(screen.getByTestId('generate-link-btn'));
    const link = (screen.getByTestId('share-link-output') as HTMLInputElement).value;
    const decoded = decodeConfig(payloadOf(link));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.config.gag.errors.messages).toEqual(['哈', '嘿', '呵']);
    }
  });
});

describe('EditorPage — share roundtrip', () => {
  it('S4 roundtrip: typed intro title survives encode → decode via the share link', () => {
    render(<EditorPage />);
    fireEvent.change(screen.getByLabelText('開場標題'), {
      target: { value: '測試標題abc' },
    });
    fireEvent.click(screen.getByTestId('generate-link-btn'));
    const link = (screen.getByTestId('share-link-output') as HTMLInputElement).value;
    const decoded = decodeConfig(payloadOf(link));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.config.intro.title).toBe('測試標題abc');
    }
  });

  it('shows the length warning only for oversized links', async () => {
    // Incompressible ~6k-char title pushes the deflated URL past 6000 chars.
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(6000));
    let big = '';
    for (const b of bytes) big += charset[b % charset.length] ?? 'x';

    const first = render(<EditorPage />);
    fireEvent.change(first.container.querySelector('#f-intro-title') as HTMLInputElement, {
      target: { value: big },
    });
    fireEvent.click(screen.getByTestId('generate-link-btn'));
    expect(screen.getByTestId('share-warning')).toBeInTheDocument();
    first.unmount();

    render(<EditorPage />);
    fireEvent.click(screen.getByTestId('generate-link-btn'));
    expect(screen.queryByTestId('share-warning')).toBeNull();
  });

  it('share button is absent when navigator.share is undefined (jsdom)', () => {
    render(<EditorPage />);
    expect(navigator.share).toBeUndefined();
    expect(screen.queryByRole('button', { name: '分享' })).toBeNull();
  });
});

describe('EditorPage — persistence', () => {
  it('autosaves the draft to localStorage 300ms after the last change', () => {
    vi.useFakeTimers();
    render(<EditorPage />);
    // Not yet persisted: the debounce has not elapsed.
    fireEvent.change(screen.getByLabelText('開場標題'), {
      target: { value: '有一件事想跟你說QQ' },
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(localStorage.getItem('invite-draft')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const saved = localStorage.getItem('invite-draft');
    expect(saved).not.toBeNull();
    expect(saved).toContain('有一件事想跟你說QQ');
  });

  it('loads a pre-seeded valid draft instead of defaults', () => {
    seedDraft('預載的標題');
    render(<EditorPage />);
    expect(screen.getByLabelText('開場標題')).toHaveValue('預載的標題');
  });

  it('falls back to DEFAULT_CONFIG when localStorage is corrupt', () => {
    localStorage.setItem('invite-draft', '{bad json');
    render(<EditorPage />);
    expect(screen.getByLabelText('開場標題')).toHaveValue(DEFAULT_CONFIG.intro.title);
  });

  it('reset flow: modal confirm restores defaults and clears storage', async () => {
    const user = userEvent.setup();
    seedDraft('會被重置的標題');
    render(<EditorPage />);
    expect(screen.getByLabelText('開場標題')).toHaveValue('會被重置的標題');

    await user.click(screen.getByTestId('reset-btn'));
    const modal = screen.getByTestId('reset-modal');
    expect(modal).toHaveTextContent('確定要重置所有設定？');

    await user.click(within(modal).getByRole('button', { name: '確定' }));
    expect(screen.queryByTestId('reset-modal')).toBeNull();
    expect(screen.getByLabelText('開場標題')).toHaveValue(DEFAULT_CONFIG.intro.title);
    expect(localStorage.getItem('invite-draft')).toBeNull();
  });
});

describe('EditorPage — notifications', () => {
  it('notify toggle generates a UUID topic once; toggling off hides it', async () => {
    const user = userEvent.setup();
    render(<EditorPage />);

    // DEFAULT notify.enabled=true + topic=null → generated once on mount.
    const topicEl = screen.getByTestId('topic-display');
    expect(topicEl.textContent).toMatch(UUID_RE);

    await user.click(screen.getByTestId('notify-toggle'));
    expect(screen.queryByTestId('topic-display')).toBeNull();

    await user.click(screen.getByTestId('notify-toggle'));
    expect(screen.getByTestId('topic-display').textContent).toMatch(UUID_RE);
    expect(screen.getByRole('link', { name: /ntfy\.sh/ })).toHaveAttribute(
      'href',
      `https://ntfy.sh/${screen.getByTestId('topic-display').textContent}`,
    );
  });
});
