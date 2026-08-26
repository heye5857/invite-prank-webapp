import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNotifier } from './notify';

/**
 * Title `來約我嘛` percent-encoded (UTF-8): pinned literal so a regression to
 * an unencoded title or a JSON body cannot pass by recomputing the same value.
 */
const TITLE_ENCODED = '%E4%BE%86%E7%B4%84%E6%88%91%E5%98%9B';

function makeFetchMock() {
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
    Promise.resolve(new Response(null, { status: 200 })),
  );
}
type FetchMock = ReturnType<typeof makeFetchMock>;

let nowMs = 0;
const clock = (): number => nowMs;
const advance = (ms: number): void => {
  nowMs += ms;
};

function setup(topic: string | null, fetchMock: FetchMock = makeFetchMock()) {
  nowMs = 0;
  const notifier = createNotifier(topic, { fetchImpl: fetchMock, now: clock });
  return { notifier, fetchMock };
}

describe('createNotifier', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('first disagreeAttempt publishes immediately with count 1 and warning tag', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.disagreeAttempt();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://ntfy.sh/party?title=${TITLE_ENCODED}&tags=warning`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      method: 'POST',
      keepalive: true,
      body: '朋友按了第 1 次不同意',
    });
  });

  it('disagreeAttempt calls within the window aggregate silently with no extra fetch', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.disagreeAttempt(); // t=0 → send
    advance(1000);
    notifier.disagreeAttempt(); // pending=1
    advance(1000);
    notifier.disagreeAttempt(); // pending=2
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('first disagreeAttempt after the window publishes one summary of pending+current and restarts the window', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.disagreeAttempt(); // t=0 → send count 1
    advance(30_000);
    notifier.disagreeAttempt(); // t=30k → pending=1, silent
    advance(31_000); // t=61k → window elapsed
    notifier.disagreeAttempt(); // summary N = pending(1) + current(1) = 2
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      method: 'POST',
      keepalive: true,
      body: '朋友已累積嘗試 2 次不同意',
    });
    advance(1000); // t=62k → inside the restarted window
    notifier.disagreeAttempt();
    expect(fetchMock).toHaveBeenCalledTimes(2); // restart proven: nothing new sent
  });

  it('agreed publishes the payoff message with tada tag via POST keepalive', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.agreed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://ntfy.sh/party?title=${TITLE_ENCODED}&tags=tada`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      method: 'POST',
      keepalive: true,
      body: '朋友同意了！🎉',
    });
  });

  it('agreed has NO throttle bucket: every call sends (payoff event)', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.agreed();
    advance(0);
    notifier.agreed();
    advance(59_999);
    notifier.agreed();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('opened publishes the exact encoded URL, plain-text body and mailbox tag via POST keepalive', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.opened();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://ntfy.sh/party?title=${TITLE_ENCODED}&tags=mailbox_with_mail`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      method: 'POST',
      keepalive: true,
      body: '朋友打開了你的邀請 📩',
    });
  });

  it('repeated opened inside the window is skipped entirely (not queued)', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.opened();
    advance(59_999);
    notifier.opened();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('null topic makes every method a noop with zero fetch calls', () => {
    const { notifier, fetchMock } = setup(null);
    expect(() => {
      notifier.opened();
      notifier.disagreeAttempt();
      notifier.agreed();
    }).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('empty-string topic makes every method a noop with zero fetch calls', () => {
    const { notifier, fetchMock } = setup('');
    expect(() => {
      notifier.opened();
      notifier.disagreeAttempt();
      notifier.agreed();
    }).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a synchronous throw from fetchImpl does not escape and is reported via console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwingFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit): never => {
      throw new Error('sync boom');
    });
    const { notifier } = setup('party', throwingFetch);
    expect(() => notifier.opened()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[notify]', expect.any(Error));
  });

  it('a rejected fetch promise warns via console.warn and never throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rejectingFetch = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Promise.reject(new Error('network down')),
    );
    const { notifier } = setup('party', rejectingFetch);
    expect(() => notifier.opened()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith('[notify]', expect.any(Error));
  });

  it('encodes special characters in the topic path segment', () => {
    const { notifier, fetchMock } = setup('my topic/#tag+&x');
    notifier.opened();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://ntfy.sh/my%20topic%2F%23tag%2B%26x?title=${TITLE_ENCODED}&tags=mailbox_with_mail`,
    );
  });

  it('two notifier instances keep independent throttle buckets', () => {
    nowMs = 0;
    const shared = makeFetchMock();
    const a = createNotifier('party', { fetchImpl: shared, now: clock });
    const b = createNotifier('party', { fetchImpl: shared, now: clock });
    a.opened();
    b.opened();
    expect(shared).toHaveBeenCalledTimes(2);
  });

  it('opened and disagreeAttempt maintain independent buckets', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.opened();
    notifier.disagreeAttempt();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Window semantics (documented): half-open [t0, t0 + 60000).
  // elapsed < 60000 → throttled; elapsed >= 60000 → expired, fires again.

  it('throttles at 59999ms elapsed (inside the half-open window)', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.opened(); // t=0
    advance(59_999);
    notifier.opened(); // still inside the window
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fires again at exactly 60000ms elapsed (window boundary is inclusive-expiring)', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.opened(); // t=0
    advance(60_000); // exactly one full window
    notifier.opened();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('disagreeAttempt flushes its summary when exactly 60000ms have elapsed', () => {
    const { notifier, fetchMock } = setup('party');
    notifier.disagreeAttempt(); // t=0 → send count 1
    advance(30_000);
    notifier.disagreeAttempt(); // pending=1
    advance(30_000); // t=60000 exactly → window expired
    notifier.disagreeAttempt(); // summary N=2
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      method: 'POST',
      keepalive: true,
      body: '朋友已累積嘗試 2 次不同意',
    });
  });
});
