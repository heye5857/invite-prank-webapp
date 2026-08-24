/**
 * PhoneFrame (T7) — device-frame wrapper for the editor live preview.
 * Purely presentational: fixed phone-ish viewport, scrollable inner surface.
 */
import type { ReactNode } from 'react';

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto h-[640px] w-[320px] overflow-hidden rounded-[2rem] border-8 border-neutral-800 bg-black shadow-2xl">
      <div className="h-full overflow-y-auto">{children}</div>
    </div>
  );
}
