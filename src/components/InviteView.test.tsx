import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG } from '../defaults';
import type { Notifier } from '../lib/notify';
import type { GagConfig, InviteConfig } from '../types';
import { InviteView } from './InviteView';

// ---------------------------------------------------------------------------
// Helpers — always build fresh configs; DEFAULT_CONFIG is never mutated.
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<InviteConfig>): InviteConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/** Shorthand for overriding only the gag section. */
function gagCfg(gag: Partial<GagConfig>): Partial<InviteConfig> {
  return { gag: { ...DEFAULT_CONFIG.gag, ...gag } };
}

function makeSpy() {
  return {
    opened: vi.fn(),
    disagreeAttempt: vi.fn(),
    agreed: vi.fn(),
  } satisfies Notifier;
}

/** Click through intro → question so the gag buttons are on screen. */
async function gotoQuestion(user: ReturnType<typeof userEvent.setup>, cfg: InviteConfig) {
  render(<InviteView config={cfg} />);
  await user.click(screen.getByTestId('intro-cta'));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('InviteView — S1 flow', () => {
  it('renders intro title/subtitle/CTA, then shows the question after CTA click', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig({
      intro: { title: '測試標題', subtitle: '測試副標', cta: '開始按' },
      question: { text: '要一起嗎？', agreeLabel: '好', disagreeLabel: '不好' },
    });
    render(<InviteView config={cfg} />);

    expect(screen.getByTestId('intro-title')).toHaveTextContent('測試標題');
    expect(screen.getByTestId('intro-subtitle')).toHaveTextContent('測試副標');
    expect(screen.getByTestId('intro-cta')).toHaveTextContent('開始按');

    await user.click(screen.getByTestId('intro-cta'));

    expect(screen.getByTestId('question-text')).toHaveTextContent('要一起嗎？');
    expect(screen.getByTestId('btn-agree')).toHaveTextContent('好');
    expect(screen.getByTestId('btn-disagree')).toHaveTextContent('不好');
  });
});

describe('InviteView — success screen (同意 payoff)', () => {
  it('agree press goes straight to the celebration screen with the DEFAULT success copy', async () => {
    const user = userEvent.setup();
    const spy = makeSpy();
    render(<InviteView config={makeConfig({})} notifier={spy} />);
    await user.click(screen.getByTestId('intro-cta'));

    await user.click(screen.getByTestId('btn-agree'));

    expect(screen.getByTestId('success-title')).toHaveTextContent(DEFAULT_CONFIG.success.title);
    expect(screen.getByTestId('success-text')).toHaveTextContent(DEFAULT_CONFIG.success.text);
    expect(screen.getByTestId('success-emoji')).toHaveTextContent(DEFAULT_CONFIG.success.emoji);
    expect(spy.agreed).toHaveBeenCalledTimes(1);
    // The prank button is gone with the question screen: refusal is impossible.
    expect(screen.queryByTestId('btn-disagree')).not.toBeInTheDocument();
  });

  it('renders custom success fields from the config', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig({
      success: { title: '自訂成功標題', text: '自訂成功內文', emoji: '🥳' },
    });
    render(<InviteView config={cfg} />);
    await user.click(screen.getByTestId('intro-cta'));

    await user.click(screen.getByTestId('btn-agree'));

    expect(screen.getByTestId('success-title')).toHaveTextContent('自訂成功標題');
    expect(screen.getByTestId('success-text')).toHaveTextContent('自訂成功內文');
    expect(screen.getByTestId('success-emoji')).toHaveTextContent('🥳');
  });
});

describe('InviteView — fakeErrors mode (不同意 press)', () => {
  it('shows the first toast message on press and the second on the next press', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['fakeErrors'], errors: { messages: ['錯誤一號', '錯誤二號'] } }));
    await gotoQuestion(user, cfg);

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('gag-overlay-toast')).toHaveTextContent('錯誤一號');

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('gag-overlay-toast')).toHaveTextContent('錯誤二號');
  });
});

describe('InviteView — fakeLoad mode (不同意 press)', () => {
  // fireEvent (sync) here: user-event's internal waits fight vitest fake timers.
  it('shows the loading spinner, then the fail toast once delayMs elapses', () => {
    vi.useFakeTimers();
    const cfg = makeConfig(gagCfg({ modes: ['fakeLoad'], fakeLoad: { delayMs: 1000, failText: '提交失敗啦' } }));
    render(<InviteView config={cfg} />);
    fireEvent.click(screen.getByTestId('intro-cta'));
    fireEvent.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('gag-overlay-loading')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByTestId('gag-overlay-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('gag-overlay-toast')).toHaveTextContent('提交失敗啦');
  });
});

describe('InviteView — dodge mode (不同意 press)', () => {
  it('changes the disagree button transform on press (deterministic rand)', async () => {
    // draw()=0.75 → x=(2*0.75-1)*120=60px, y=(2*0.75-1)*60=30px
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const user = userEvent.setup();
    const cfg = makeConfig({ gag: { ...DEFAULT_CONFIG.gag, modes: ['dodge'] } });
    await gotoQuestion(user, cfg);

    const disagree = screen.getByTestId('btn-disagree');
    const before = disagree.style.transform;
    await user.click(disagree);
    const after = disagree.style.transform;

    expect(after).not.toBe(before);
    expect(after).toContain('translate(60px, 30px)');
    // The escape hatch never moves: 同意 stays exactly where it was.
    expect(screen.getByTestId('btn-agree').style.transform).toBe('scale(1)');
  });
});

describe('InviteView — shrink mode (不同意 press)', () => {
  it('shrinks the disagree button and enlarges the agree button per press', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig({
      gag: { ...DEFAULT_CONFIG.gag, modes: ['shrink'], shrink: { minScale: 0.35 } },
    });
    await gotoQuestion(user, cfg);

    const agree = screen.getByTestId('btn-agree');
    const disagree = screen.getByTestId('btn-disagree');

    await user.click(disagree);
    expect(disagree.style.transform).toContain('scale(0.85)');
    expect(agree.style.transform).toContain('scale(1.12)');

    await user.click(disagree);
    const disagreeMatch = /scale\(([\d.]+)\)/.exec(disagree.style.transform);
    const agreeMatch = /scale\(([\d.]+)\)/.exec(agree.style.transform);
    expect(disagreeMatch).not.toBeNull();
    expect(agreeMatch).not.toBeNull();
    expect(Number(disagreeMatch?.[1])).toBeLessThan(0.85);
    expect(Number(agreeMatch?.[1])).toBeGreaterThan(1.12);
  });
});

describe('InviteView — confirmLoop mode (不同意 press)', () => {
  it('shows a confirm modal with the prompt; clicking 確定 closes it', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['confirmLoop'], confirmLoop: { prompts: ['你確定嗎？'] } }));
    await gotoQuestion(user, cfg);

    await user.click(screen.getByTestId('btn-disagree'));
    const modal = screen.getByTestId('gag-modal-confirm');
    expect(modal).toHaveTextContent('你確定嗎？');

    await user.click(screen.getByRole('button', { name: '確定' }));
    expect(screen.queryByTestId('gag-modal-confirm')).not.toBeInTheDocument();
  });
});

describe('InviteView — milestone banner (不同意 press)', () => {
  it('appears when everyN=1 right after the first press', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['fakeErrors'], milestones: { everyN: 1, messages: ['M'] } }));
    await gotoQuestion(user, cfg);

    expect(screen.queryByTestId('milestone-banner')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('milestone-banner')).toHaveTextContent('M');
  });

  it('is transient with everyN=2: absent, present on 2nd press, cleared on 3rd', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['fakeErrors'], milestones: { everyN: 2, messages: ['里程碑'] } }));
    await gotoQuestion(user, cfg);

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.queryByTestId('milestone-banner')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('milestone-banner')).toHaveTextContent('里程碑');

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.queryByTestId('milestone-banner')).not.toBeInTheDocument();
  });
});

describe('InviteView — notifier wiring', () => {
  it('never calls opened itself; fires disagreeAttempt per 不同意 press and agreed exactly once on 同意', async () => {
    const user = userEvent.setup();
    const spy = makeSpy();
    render(<InviteView config={makeConfig({})} notifier={spy} />);

    expect(spy.opened).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('intro-cta'));
    await user.click(screen.getByTestId('btn-disagree'));
    await user.click(screen.getByTestId('btn-disagree'));
    expect(spy.disagreeAttempt).toHaveBeenCalledTimes(2);
    expect(spy.agreed).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('btn-agree'));
    expect(spy.agreed).toHaveBeenCalledTimes(1);
  });
});

describe('InviteView — theming', () => {
  it('exposes theme CSS vars, font scale, and fixed-position emoji decor', () => {
    const cfg = makeConfig({
      theme: {
        presetId: 'custom',
        bg: '#112233',
        accent: '#aabbcc',
        textColor: '#ddeeff',
        fontScale: 1.2,
        emojiDecor: ['🌟', '🍀'],
      },
    });
    render(<InviteView config={cfg} />);

    const root = screen.getByTestId('invite-root');
    expect(root.style.getPropertyValue('--inv-bg')).toBe('#112233');
    expect(root.style.getPropertyValue('--inv-accent')).toBe('#aabbcc');
    expect(root.style.getPropertyValue('--inv-text')).toBe('#ddeeff');
    expect(root.style.background).toBe('var(--inv-bg)');
    expect(root.style.color).toBe('var(--inv-text)');
    // Component sets fontSize: calc(1rem * 1.2); jsdom normalizes calc() on parse.
    expect(root.style.fontSize).toBe('calc(1.2rem)');

    expect(screen.getByText('🌟')).toBeInTheDocument();
    expect(screen.getByText('🍀')).toBeInTheDocument();
  });
});

describe('InviteView — gag state reset on config change', () => {
  it('applies a NEW gag config from press #1 instead of continuing stale engine state', async () => {
    const user = userEvent.setup();
    const cfgA: InviteConfig = {
      ...DEFAULT_CONFIG,
      gag: {
        ...DEFAULT_CONFIG.gag,
        modes: ['fakeErrors', 'fakeLoad'],
        dodge: { times: 1 },
      },
    };
    const { rerender } = render(<InviteView config={cfgA} />);
    await user.click(screen.getByTestId('intro-cta'));

    // Press 1 → fakeErrors toast; press 2 → falls through to fakeLoad (loading).
    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('gag-overlay-toast')).toBeInTheDocument();
    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('gag-overlay-loading')).toBeInTheDocument();

    // Swap to a single-mode config: stale modeIdx (1) would point OUTSIDE the
    // new array and presses would silently no-op. The reset makes press #1 of
    // the new config show its first effect immediately.
    const cfgB: InviteConfig = {
      ...DEFAULT_CONFIG,
      gag: {
        ...DEFAULT_CONFIG.gag,
        modes: ['confirmLoop'],
        dodge: { times: 1 },
      },
    };
    rerender(<InviteView config={cfgB} />);

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('gag-modal-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('gag-modal-confirm')).toHaveTextContent('你確定嗎？');
  });
});
