/**
 * Hash-based routing (no router lib).
 *   #p=<payload> -> InvitePage (shared invite view)
 *   anything else -> EditorPage
 * The route re-evaluates on `hashchange` so pasting a fresh invite link
 * into the same tab switches views without a manual reload.
 */
import { useEffect, useState } from 'react';
import InvitePage from './pages/InvitePage';
import EditorPage from './pages/EditorPage';

const INVITE_PREFIX = '#p=';

export type Route = { kind: 'invite'; payload: string } | { kind: 'editor' };

export function parseRoute(hash: string): Route {
  if (hash.startsWith(INVITE_PREFIX)) {
    return { kind: 'invite', payload: hash.slice(INVITE_PREFIX.length) };
  }
  return { kind: 'editor' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route.kind === 'invite') {
    return <InvitePage payload={route.payload} />;
  }
  return <EditorPage />;
}
