import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';

interface Dir {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface Props {
  onChange: (dir: Dir) => void;
  onFire: (down: boolean) => void;
}

const PAD_SIZE = 140;
const KNOB_SIZE = 56;
const DEADZONE = 0.25;

/**
 * Touch joystick + fire button for mobile. Hidden on devices without
 * touch input via CSS, but the React side always renders so we don't
 * have to deal with pointer-capability media queries in JS.
 */
export function VirtualJoystick({ onChange, onFire }: Props): JSX.Element {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const setDir = useCallback(
    (dir: Dir) => {
      onChange(dir);
    },
    [onChange],
  );

  const handlePointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const max = rect.width / 2;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, max);
      const nx = (dx / len) * clamped;
      const ny = (dy / len) * clamped;
      setKnob({ x: nx, y: ny });
      const ratio = clamped / max;
      if (ratio < DEADZONE) {
        setDir({ up: false, down: false, left: false, right: false });
        return;
      }
      const angle = Math.atan2(dy, dx);
      const deg = (angle * 180) / Math.PI;
      const dir: Dir = { up: false, down: false, left: false, right: false };
      // 8-way mapping; tanks ignore diagonals server-side anyway.
      if (deg >= -22.5 && deg < 22.5) dir.right = true;
      else if (deg >= 22.5 && deg < 67.5) {
        dir.right = true;
        dir.down = true;
      } else if (deg >= 67.5 && deg < 112.5) dir.down = true;
      else if (deg >= 112.5 && deg < 157.5) {
        dir.down = true;
        dir.left = true;
      } else if (deg >= 157.5 || deg < -157.5) dir.left = true;
      else if (deg >= -157.5 && deg < -112.5) {
        dir.left = true;
        dir.up = true;
      } else if (deg >= -112.5 && deg < -67.5) dir.up = true;
      else if (deg >= -67.5 && deg < -22.5) {
        dir.up = true;
        dir.right = true;
      }
      setDir(dir);
    },
    [setDir],
  );

  const handleStart = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      handlePointer(e);
    },
    [handlePointer],
  );

  const handleEnd = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setKnob({ x: 0, y: 0 });
      setDir({ up: false, down: false, left: false, right: false });
    },
    [setDir],
  );

  // Fire button — press-and-hold.
  const fireDown = useRef(false);
  const fireStart = (e: PointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    fireDown.current = true;
    onFire(true);
  };
  const fireEnd = (e: PointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    if (!fireDown.current) return;
    fireDown.current = false;
    onFire(false);
  };

  useEffect(() => {
    return () => {
      onFire(false);
      onChange({ up: false, down: false, left: false, right: false });
    };
  }, [onChange, onFire]);

  return (
    <div className="touch-controls" aria-hidden>
      <div
        ref={padRef}
        className="joystick-pad"
        style={{ width: PAD_SIZE, height: PAD_SIZE }}
        onPointerDown={handleStart}
        onPointerMove={(e) => {
          if (e.buttons === 0) return;
          handlePointer(e);
        }}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        <div
          className="joystick-knob"
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          }}
        />
      </div>
      <button
        type="button"
        className="fire-btn"
        onPointerDown={fireStart}
        onPointerUp={fireEnd}
        onPointerCancel={fireEnd}
        onPointerLeave={fireEnd}
      >
        FIRE
      </button>
    </div>
  );
}
