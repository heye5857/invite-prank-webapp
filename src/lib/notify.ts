/**
 * Fire-and-forget ntfy.sh publisher with per-event-type throttling.
 *
 * Design constraints:
 * - Simple CORS requests only: plain-text body + query params (no custom
 *   headers) so the browser never issues a preflight.
 * - Failures must NEVER propagate: no sync throw, no unhandled rejection.
 * - Zero backend; responses are ignored.
 */

const THROTTLE_MS = 60_000;
const TITLE = '來約我嘛';

const TAG_OPENED = 'mailbox_with_mail';
const TAG_DISAGREE = 'warning';
const TAG_TADA = 'tada';

const MSG_OPENED = '朋友打開了你的邀請 📩';
const MSG_AGREED = '朋友同意了！🎉';

export interface Notifier {
  /** Friend opened the invite page. */
  opened(): void;
  /** One tap on 不同意 (aggregated while throttled). */
  disagreeAttempt(): void;
  /** Friend pressed 同意 — the payoff event; always sends, never throttled. */
  agreed(): void;
}

export interface NotifierOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

const NOOP_NOTIFIER: Notifier = {
  opened: () => {},
  disagreeAttempt: () => {},
  agreed: () => {},
};

/**
 * Window semantics: half-open [sentAt, sentAt + THROTTLE_MS).
 * elapsed < THROTTLE_MS → throttled; elapsed >= THROTTLE_MS → expired.
 */
const isThrottled = (sentAt: number | null, ts: number): boolean =>
  sentAt !== null && ts - sentAt < THROTTLE_MS;

export function createNotifier(topic: string | null, opts?: NotifierOptions): Notifier {
  if (topic === null || topic === '') {
    return NOOP_NOTIFIER;
  }
  const activeTopic: string = topic;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = opts?.now ?? Date.now;

  const publish = (tag: string, message: string): void => {
    const url = `https://ntfy.sh/${encodeURIComponent(activeTopic)}?title=${encodeURIComponent(TITLE)}&tags=${tag}`;
    try {
      fetchImpl(url, { method: 'POST', keepalive: true, body: message }).catch(
        (err: unknown) => console.warn('[notify]', err),
      );
    } catch (err) {
      // Boundary by contract: notification failures must never reach callers.
      console.warn('[notify]', err); // no-excuse-ok: catch
    }
  };

  let openedSentAt: number | null = null;
  let disagreeWindowStartedAt: number | null = null;
  let disagreePendingCount = 0;

  return {
    opened(): void {
      const ts = now();
      if (isThrottled(openedSentAt, ts)) return;
      openedSentAt = ts;
      publish(TAG_OPENED, MSG_OPENED);
    },

    disagreeAttempt(): void {
      const ts = now();
      if (isThrottled(disagreeWindowStartedAt, ts)) {
        disagreePendingCount += 1; // silent accumulation inside the window
        return;
      }
      const total = disagreePendingCount + 1;
      disagreePendingCount = 0;
      disagreeWindowStartedAt = ts;
      publish(
        TAG_DISAGREE,
        total === 1 ? '朋友按了第 1 次不同意' : `朋友已累積嘗試 ${total} 次不同意`,
      );
    },

    agreed(): void {
      // Payoff event: no throttle bucket — every 同意 press is worth knowing.
      publish(TAG_TADA, MSG_AGREED);
    },
  };
}
