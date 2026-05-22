import type { JSX, ReactNode } from 'react';

/** Wraps the game UI in the CRT/scanline aesthetic. */
export function CRTFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="crt-outer">
      <div className="crt-inner">
        {children}
        <div className="crt-scanlines" aria-hidden />
        <div className="crt-vignette" aria-hidden />
      </div>
    </div>
  );
}
