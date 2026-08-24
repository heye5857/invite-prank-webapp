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
    agreeAttempt: vi.fn(),
    gaveUp: vi.fn(),
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

describe('InviteView — fakeErrors mode', () => {
  it('shows the first toast message on press and the second on the next press', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['fakeErrors'], errors: { messages: ['錯誤一號', '錯誤二號'] } }));
    await gotoQuestion(user, cfg);

    await user.click(screen.getByTestId('btn-agree'));
    expect(screen.getByTestId('gag-overlay-toast')).toHaveTextContent('錯誤一號');

    await user.click(screen.getByTestId('btn-agree'));
    expect(screen.getByTestId('gag-overlay-toast')).toHaveTextContent('錯誤二號');
  });
});

describe('InviteView — fakeLoad mode', () => {
  // fireEvent (sync) here: user-event's internal waits fight vitest fake timers.
  it('shows the loading spinner, then the fail toast once delayMs elapses', () => {
    vi.useFakeTimers();
    const cfg = makeConfig(gagCfg({ modes: ['fakeLoad'], fakeLoad: { delayMs: 1000, failText: '提交失敗啦' } }));
    render(<InviteView config={cfg} />);
    fireEvent.click(screen.getByTestId('intro-cta'));
    fireEvent.click(screen.getByTestId('btn-agree'));
    expect(screen.getByTestId('gag-overlay-loading')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByTestId('gag-overlay-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('gag-overlay-toast')).toHaveTextContent('提交失敗啦');
  });
});

describe('InviteView — dodge mode', () => {
  it('changes the agree button transform on press (deterministic rand)', async () => {
    // draw()=0.75 → x=(2*0.75-1)*120=60px, y=(2*0.75-1)*60=30px
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const user = userEvent.setup();
    const cfg = makeConfig({ gag: { ...DEFAULT_CONFIG.gag, modes: ['dodge'] } });
    await gotoQuestion(user, cfg);

    const agree = screen.getByTestId('btn-agree');
    const before = agree.style.transform;
    await user.click(agree);
    const after = agree.style.transform;

    expect(after).not.toBe(before);
    expect(after).toContain('translate(60px, 30px)');
  });
});

describe('InviteView — shrink mode', () => {
  it('shrinks the agree button and enlarges the disagree button per press', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig({
      gag: { ...DEFAULT_CONFIG.gag, modes: ['shrink'], shrink: { minScale: 0.35 } },
    });
    await gotoQuestion(user, cfg);

    const agree = screen.getByTestId('btn-agree');
    const disagree = screen.getByTestId('btn-disagree');

    await user.click(agree);
    expect(agree.style.transform).toContain('scale(0.85)');
    expect(disagree.style.transform).toContain('scale(1.12)');

    await user.click(agree);
    const agreeMatch = /scale\(([\d.]+)\)/.exec(agree.style.transform);
    const disagreeMatch = /scale\(([\d.]+)\)/.exec(disagree.style.transform);
    expect(agreeMatch).not.toBeNull();
    expect(disagreeMatch).not.toBeNull();
    expect(Number(agreeMatch?.[1])).toBeLessThan(0.85);
    expect(Number(disagreeMatch?.[1])).toBeGreaterThan(1.12);
  });
});

describe('InviteView — confirmLoop mode', () => {
  it('shows a confirm modal with the prompt; clicking 確定 closes it', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['confirmLoop'], confirmLoop: { prompts: ['你確定嗎？'] } }));
    await gotoQuestion(user, cfg);

    await user.click(screen.getByTestId('btn-agree'));
    const modal = screen.getByTestId('gag-modal-confirm');
    expect(modal).toHaveTextContent('你確定嗎？');

    await user.click(screen.getByRole('button', { name: '確定' }));
    expect(screen.queryByTestId('gag-modal-confirm')).not.toBeInTheDocument();
  });
});

describe('InviteView — disagree flow', () => {
  it('walks steps in order and reaches the final screen past the last step', async () => {
    const user = userEvent.setup();
    const spy = makeSpy();
    const cfg = makeConfig({
      disagreeFlow: {
        steps: [
          { text: '步驟零', buttonLabel: '下一步零' },
          { text: '步驟一', buttonLabel: '下一步一' },
          { text: '步驟二', buttonLabel: '下一步二' },
        ],
        loop: false,
        finalTitle: '結束標題',
        finalText: '結束內文',
      },
    });
    render(<InviteView config={cfg} notifier={spy} />);
    await user.click(screen.getByTestId('intro-cta'));

    await user.click(screen.getByTestId('btn-disagree'));
    expect(screen.getByTestId('disagree-step-text')).toHaveTextContent('步驟零');
    expect(spy.gaveUp).toHaveBeenNthCalledWith(1, 1);

    await user.click(screen.getByTestId('disagree-next-btn'));
    expect(screen.getByTestId('disagree-step-text')).toHaveTextContent('步驟一');
    expect(spy.gaveUp).toHaveBeenNthCalledWith(2, 2);

    await user.click(screen.getByTestId('disagree-next-btn'));
    expect(screen.getByTestId('disagree-step-text')).toHaveTextContent('步驟二');

    await user.click(screen.getByTestId('disagree-next-btn'));
    expect(screen.getByTestId('final-title')).toHaveTextContent('結束標題');
    expect(screen.getByText('結束內文')).toBeInTheDocument();
  });

  it('wraps back to the first step when loop is true', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig({
      disagreeFlow: {
        steps: [
          { text: '循環甲', buttonLabel: '繼續甲' },
          { text: '循環乙', buttonLabel: '繼續乙' },
        ],
        loop: true,
        finalTitle: '不會到這',
        finalText: '',
      },
    });
    render(<InviteView config={cfg} />);
    await user.click(screen.getByTestId('intro-cta'));

    await user.click(screen.getByTestId('btn-disagree'));
    await user.click(screen.getByTestId('disagree-next-btn'));
    expect(screen.getByTestId('disagree-step-text')).toHaveTextContent('循環乙');

    await user.click(screen.getByTestId('disagree-next-btn'));
    expect(screen.queryByTestId('final-title')).not.toBeInTheDocument();
    expect(screen.getByTestId('disagree-step-text')).toHaveTextContent('循環甲');
  });
});

describe('InviteView — milestone banner', () => {
  it('appears when everyN=1 right after the first press', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['fakeErrors'], milestones: { everyN: 1, messages: ['M'] } }));
    await gotoQuestion(user, cfg);

    expect(screen.queryByTestId('milestone-banner')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('btn-agree'));
    expect(screen.getByTestId('milestone-banner')).toHaveTextContent('M');
  });

  it('is transient with everyN=2: absent, present on 2nd press, cleared on 3rd', async () => {
    const user = userEvent.setup();
    const cfg = makeConfig(gagCfg({ modes: ['fakeErrors'], milestones: { everyN: 2, messages: ['里程碑'] } }));
    await gotoQuestion(user, cfg);

    await user.click(screen.getByTestId('btn-agree'));
    expect(screen.queryByTestId('milestone-banner')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('btn-agree'));
    expect(screen.getByTestId('milestone-banner')).toHaveTextContent('里程碑');

    await user.click(screen.getByTestId('btn-agree'));
    expect(screen.queryByTestId('milestone-banner')).not.toBeInTheDocument();
  });
});

describe('InviteView — notifier wiring', () => {
  it('never calls opened itself; fires agreeAttempt exactly once per agree press', async () => {
    const user = userEvent.setup();
    const spy = makeSpy();
    render(<InviteView config={makeConfig({})} notifier={spy} />);

    expect(spy.opened).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('intro-cta'));
    await user.click(screen.getByTestId('btn-agree'));

    expect(spy.agreeAttempt).toHaveBeenCalledTimes(1);
    expect(spy.gaveUp).not.toHaveBeenCalled();
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
