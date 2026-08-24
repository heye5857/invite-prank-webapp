/**
 * InvitePage (T6) — standalone route wrapper around the shared InviteView.
 * Owns payload decoding, notifier construction (exactly once per config), and
 * the opened-on-mount ping. InviteView itself stays route-agnostic so the
 * editor live-preview can reuse it without a payload.
 */
import { useEffect, useMemo } from 'react';

import { InviteView } from '../components/InviteView';
import { decodeConfig } from '../lib/codec';
import { createNotifier } from '../lib/notify';

export default function InvitePage({ payload }: { payload: string }) {
  const decoded = useMemo(() => decodeConfig(payload), [payload]);

  const notifier = useMemo(() => {
    if (!decoded.ok) return undefined;
    const { enabled, topic } = decoded.config.notify;
    return enabled && topic !== null ? createNotifier(topic) : undefined;
  }, [decoded]);

  useEffect(() => {
    notifier?.opened();
  }, [notifier]);

  if (!decoded.ok) {
    return (
      <main
        data-testid="error-screen"
        className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-2xl font-black">連結好像壞掉了 🥲</p>
        <p className="text-sm opacity-70">
          請向邀請你的人重新要一條連結，或回到上一頁再試一次。
        </p>
      </main>
    );
  }

  return <InviteView config={decoded.config} notifier={notifier} />;
}
