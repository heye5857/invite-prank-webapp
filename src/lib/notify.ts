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
const TAG_AGREE = 'warning';
const TAG_GAVE_UP = 'white_flag';

const MSG_OPENED = '朋友打開了你的邀請 📩';
const gaveUpMessage = (step: number): string => `朋友按了「不同意」（第 ${step} 步）🏳️`;

export interface Notifier {
  /** Friend opened the invite page. */
  opened(): void;
  /** One tap on 同意 (aggregated while throttled). */
  agreeAttempt(): void;
  /** Friend entered disagree step k (1-based). */
  gaveUp(step: number): void;
}

export interface NotifierOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

const NOOP_NOTIFIER: Notifier = {
  opened: () => {},
  agreeAttempt: () => {},
  gaveUp: () => {},
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
  let gaveUpSentAt: number | null = null;
  let agreeWindowStartedAt: number | null = null;
  let agreePendingCount = 0;

  return {
    opened(): void {
      const ts = now();
      if (isThrottled(openedSentAt, ts)) return;
      openedSentAt = ts;
      publish(TAG_OPENED, MSG_OPENED);
    },

    agreeAttempt(): void {
      const ts = now();
      if (isThrottled(agreeWindowStartedAt, ts)) {
        agreePendingCount += 1; // silent accumulation inside the window
        return;
      }
      const total = agreePendingCount + 1;
      agreePendingCount = 0;
      agreeWindowStartedAt = ts;
      publish(
        TAG_AGREE,
        total === 1 ? '朋友按了第 1 次同意' : `朋友已累積嘗試 ${total} 次同意`,
      );
    },

    gaveUp(step: number): void {
      const ts = now();
      if (isThrottled(gaveUpSentAt, ts)) return;
      gaveUpSentAt = ts;
      publish(TAG_GAVE_UP, gaveUpMessage(step));
    },
  };
}
