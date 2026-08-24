/**
 * Hash-based routing (no router lib).
 *   #p=<payload> -> InvitePage (shared invite view)
 *   anything else -> EditorPage
 * Delegates (T6/T7) replace the placeholder bodies; keep the dispatch contract.
 */
import InvitePage from './pages/InvitePage';

const INVITE_PREFIX = '#p=';

export function parseRoute(hash: string): { kind: 'invite'; payload: string } | { kind: 'editor' } {
  if (hash.startsWith(INVITE_PREFIX)) {
    return { kind: 'invite', payload: hash.slice(INVITE_PREFIX.length) };
  }
  return { kind: 'editor' };
}

export default function App() {
  const route = parseRoute(window.location.hash);
  if (route.kind === 'invite') {
    return <InvitePage payload={route.payload} />;
  }
  // TODO(T7): return <EditorPage />
  return <main data-testid="editor-placeholder" className="p-8">editor placeholder</main>;
}
