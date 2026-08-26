/**
 * InviteView (T6) — the ONE renderer shared by the standalone invite route and
 * the editor live-preview. Presentational + local flow state only; all gag
 * outcomes come from the pure engine in lib/gagEngine.ts.
 *
 * Inverted prank flow: 同意 succeeds IMMEDIATELY (celebration screen — the
 * whole point is driving the friend to agree), while 不同意 triggers the five
 * gag behaviors and can NEVER succeed.
 *
 * Export contract for later waves: named export `InviteView` with props
 * `{ config: InviteConfig; notifier?: Notifier }` (notifier omitted = silent).
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import { createInitialGagState, reduceGag } from '../lib/gagEngine';
import type { GagOverlay, GagState } from '../lib/gagEngine';
import type { Notifier } from '../lib/notify';
import type { InviteConfig } from '../types';

type Screen = 'intro' | 'question' | 'success';

function assertNever(value: never): never {
  throw new Error(`unexpected value: ${String(value)}`);
}

/** Hand-picked fixed spots for decorative emojis — no randomness, stable tests. */
const DECOR_SPOTS: readonly { top: string; left: string }[] = [
  { top: '6%', left: '8%' }, { top: '14%', left: '70%' },
  { top: '26%', left: '36%' }, { top: '38%', left: '4%' },
  { top: '46%', left: '78%' }, { top: '64%', left: '12%' },
  { top: '72%', left: '64%' }, { top: '86%', left: '40%' },
];

/** Satisfies noUncheckedIndexedAccess; unreachable while DECOR_SPOTS stays non-empty. */
const FALLBACK_SPOT: { top: string; left: string } = { top: '50%', left: '50%' };

const BTN_BASE =
  'rounded-xl px-6 py-3 font-bold text-white shadow-lg transition-transform duration-200';

export interface InviteViewProps {
  config: InviteConfig;
  notifier?: Notifier;
  /** Overrides the root data-testid so the editor preview can be scoped in tests. */
  rootTestId?: string;
}

export function InviteView({ config, notifier, rootTestId = 'invite-root' }: InviteViewProps) {
  const [screen, setScreen] = useState<Screen>('intro');
  const [gag, setGag] = useState<GagState>(createInitialGagState);

  // A new gag configuration is a NEW simulation: reset the engine state so the
  // editor preview always reflects the current modes from press #1. Without
  // this, a stale modeIdx can point outside the new modes array and presses
  // silently no-op (engine guards out-of-range indices by returning state).
  useEffect(() => {
    setGag(createInitialGagState());
  }, [config.gag]);

  // Loading overlay auto-dismisses after delayMs; the engine turns it into a
  // toast carrying cfg.fakeLoad.failText. Cleanup covers unmount + state change.
  const dismiss = () => setGag((prev) => reduceGag(prev, { type: 'DISMISS' }, config.gag));
  useEffect(() => {
    if (gag.overlay?.kind !== 'loading') return;
    const timer = setTimeout(dismiss, gag.overlay.delayMs);
    return () => clearTimeout(timer);
  }, [gag.overlay, config.gag]);

  const rootStyle = {
    background: 'var(--inv-bg)',
    color: 'var(--inv-text)',
    fontSize: `calc(1rem * ${config.theme.fontScale})`,
    '--inv-bg': config.theme.bg,
    '--inv-accent': config.theme.accent,
    '--inv-text': config.theme.textColor,
  } as CSSProperties;

  // 同意 succeeds immediately — the celebration screen IS the product.
  const pressAgree = () => {
    setScreen('success');
    notifier?.agreed();
  };

  // 不同意 is the prank button: gag engine + notify, never a refusal.
  const pressDisagree = () => {
    setGag((prev) => reduceGag(prev, { type: 'PRANK_PRESS' }, config.gag));
    notifier?.disagreeAttempt();
  };

  const panel = () => {
    switch (screen) {
      case 'intro':
        return (
          <section className="flex min-h-dvh flex-col items-center justify-center gap-6 text-center">
            <h1 data-testid="intro-title" className="text-4xl font-black leading-tight">
              {config.intro.title}
            </h1>
            <p data-testid="intro-subtitle" className="text-lg opacity-80">
              {config.intro.subtitle}
            </p>
            <button
              type="button" data-testid="intro-cta" onClick={() => setScreen('question')}
              style={{ backgroundColor: 'var(--inv-accent)' }}
              className={`${BTN_BASE} mt-2 w-full max-w-xs text-lg active:scale-95`}
            >
              {config.intro.cta}
            </button>
          </section>
        );
      case 'question':
        return (
          <section className="flex min-h-dvh flex-col justify-center gap-8 py-16">
            {gag.milestoneMessage !== null && (
              <div
                data-testid="milestone-banner"
                role="status"
                className="rounded-xl bg-black/10 px-4 py-3 text-center text-sm font-bold"
              >
                {gag.milestoneMessage}
              </div>
            )}
            <h2 data-testid="question-text" className="text-center text-3xl font-black leading-snug">
              {config.question.text}
            </h2>
            <div className="flex flex-col items-stretch gap-5">
              <button
                type="button" data-testid="btn-agree" onClick={pressAgree}
                style={{
                  backgroundColor: 'var(--inv-accent)',
                  // The escape hatch: never dodges, and GROWS as the friend
                  // keeps refusing — always easy to press.
                  transform: `scale(${gag.scaleEscape})`,
                }}
                className={BTN_BASE}
              >
                {config.question.agreeLabel}
              </button>
              <button
                type="button" data-testid="btn-disagree" onClick={pressDisagree}
                style={{
                  backgroundColor: 'var(--inv-accent)',
                  // The prank target: dodges the press and shrinks away.
                  transform: `translate(${gag.offset.x}px, ${gag.offset.y}px) scale(${gag.scalePrank})`,
                }}
                className={BTN_BASE}
              >
                {config.question.disagreeLabel}
              </button>
            </div>
          </section>
        );
      case 'success':
        return (
          <section
            className="flex min-h-dvh flex-col items-center justify-center gap-6 text-center"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, color-mix(in srgb, var(--inv-accent) 10%, transparent), transparent)',
            }}
          >
            <span
              data-testid="success-emoji"
              aria-hidden
              className="animate-bounce select-none text-7xl"
            >
              {config.success.emoji}
            </span>
            <h2 data-testid="success-title" className="text-3xl font-black">
              {config.success.title}
            </h2>
            <p data-testid="success-text" className="text-lg opacity-80">
              {config.success.text}
            </p>
          </section>
        );
      default:
        return assertNever(screen);
    }
  };

  return (
    <div
      data-testid={rootTestId}
      style={rootStyle}
      className="relative mx-auto min-h-dvh max-w-md overflow-hidden px-6"
    >
      {config.theme.emojiDecor.map((emoji, i) => {
        const spot = DECOR_SPOTS[i % DECOR_SPOTS.length] ?? FALLBACK_SPOT;
        return (
          <span
            key={`${emoji}-${i}`}
            aria-hidden
            style={{ top: spot.top, left: spot.left }}
            className="pointer-events-none absolute select-none text-7xl opacity-15"
          >
            {emoji}
          </span>
        );
      })}
      {panel()}
      <GagOverlayLayer overlay={gag.overlay} onDismiss={dismiss} />
    </div>
  );
}

function GagOverlayLayer({ overlay, onDismiss }: { overlay: GagOverlay; onDismiss: () => void }) {
  if (overlay === null) return null;
  switch (overlay.kind) {
    case 'toast':
      return (
        <div
          data-testid="gag-overlay-toast"
          role="status"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-2xl bg-slate-900/90 px-5 py-4 text-center text-base font-bold text-white shadow-2xl"
        >
          {overlay.message}
        </div>
      );
    case 'loading':
      return (
        <div
          data-testid="gag-overlay-loading"
          role="alert"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div
            aria-hidden
            className="h-14 w-14 animate-spin rounded-full border-4 border-white/30 border-t-white"
          />
        </div>
      );
    case 'confirm':
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div
            data-testid="gag-modal-confirm"
            role="dialog"
            aria-modal
            className="w-full max-w-xs rounded-2xl bg-white px-6 py-6 text-center shadow-2xl"
          >
            <p className="mb-5 text-lg font-bold text-slate-800">{overlay.prompt}</p>
            <button
              type="button"
              onClick={onDismiss}
              style={{ backgroundColor: 'var(--inv-accent)' }}
              className={`${BTN_BASE} w-full`}
            >
              確定
            </button>
          </div>
        </div>
      );
    default:
      return assertNever(overlay);
  }
}
