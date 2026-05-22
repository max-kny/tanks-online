import { PlayerInput } from './types';

/**
 * Aggregates keyboard + virtual joystick into a single PlayerInput snapshot.
 * The hook owner reads the current snapshot every frame and pushes it to
 * the server.
 */
export class InputController {
  private keys: Record<string, boolean> = {};
  private joystick: { up: boolean; down: boolean; left: boolean; right: boolean } = {
    up: false,
    down: false,
    left: false,
    right: false,
  };
  private fireDown = false;
  private seq = 0;
  private detach: (() => void) | null = null;

  attach(target: Window = window): void {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.repeat) return;
      const map: Record<string, string> = {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right',
        Space: 'fire',
        KeyJ: 'fire',
      };
      const mapped = map[e.code];
      if (!mapped) return;
      e.preventDefault();
      this.keys[mapped] = down;
      if (mapped === 'fire') this.fireDown = down;
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const blur = () => {
      this.keys = {};
      this.fireDown = false;
    };
    target.addEventListener('keydown', kd as EventListener);
    target.addEventListener('keyup', ku as EventListener);
    target.addEventListener('blur', blur);
    this.detach = () => {
      target.removeEventListener('keydown', kd as EventListener);
      target.removeEventListener('keyup', ku as EventListener);
      target.removeEventListener('blur', blur);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  setJoystick(dir: { up: boolean; down: boolean; left: boolean; right: boolean }): void {
    this.joystick = dir;
  }

  setFire(down: boolean): void {
    this.fireDown = down;
    this.keys['fire'] = down;
  }

  /** Snapshot the current input state and bump the sequence number. */
  snapshot(): PlayerInput {
    this.seq += 1;
    return {
      seq: this.seq,
      up: !!this.keys['up'] || this.joystick.up,
      down: !!this.keys['down'] || this.joystick.down,
      left: !!this.keys['left'] || this.joystick.left,
      right: !!this.keys['right'] || this.joystick.right,
      fire: this.fireDown,
    };
  }
}
