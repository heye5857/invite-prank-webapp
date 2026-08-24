/**
 * Hash-based routing (no router lib).
 *   #p=<payload> -> InvitePage (shared invite view)
 *   anything else -> EditorPage
 * Delegates (T6/T7) replace the placeholder bodies; keep the dispatch contract.
 */
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
    // TODO(T6): return <InvitePage payload={route.payload} />
    return <main data-surface="invite-placeholder" className="p-8">invite placeholder</main>;
  }
  // TODO(T7): return <EditorPage />
  return <main data-surface="editor-placeholder" className="p-8">editor placeholder</main>;
}
