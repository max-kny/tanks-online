import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { configureCanvas, renderFrame } from '../game/render';
import { InputController } from '../game/input';
import { getSocket } from '../game/socket';
import type { GameSnapshot, LobbyState, MapData, PlaneState, TileKind } from '../game/types';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../game/constants';
import { HUD } from './HUD';
import { VirtualJoystick } from './VirtualJoystick';

interface Props {
  map: MapData;
  youId: string;
  initialSnapshot: GameSnapshot;
  lobby: LobbyState;
}

/**
 * Owns the canvas + game loop. Holds the latest two snapshots and renders
 * with interpolation for smooth motion despite the 30Hz server tick.
 */
export function GameScreen({ map: initialMap, youId, initialSnapshot, lobby }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MapData>(cloneMap(initialMap));
  const snapshotsRef = useRef<{ prev: GameSnapshot | null; curr: GameSnapshot; receivedAt: number; prevAt: number }>({
    prev: null,
    curr: initialSnapshot,
    receivedAt: performance.now(),
    prevAt: performance.now(),
  });
  const inputRef = useRef<InputController>(new InputController());
  const planeRef = useRef<PlaneState | null>(initialSnapshot.plane);
  // Re-render hooks for HUD when the snapshot changes.
  const [hudSnapshot, setHudSnapshot] = useState<GameSnapshot>(initialSnapshot);

  // Socket wiring — listen for state + one-shot events.
  useEffect(() => {
    const socket = getSocket();
    const onState = (s: GameSnapshot): void => {
      const now = performance.now();
      // Apply incremental tile changes (the server resets tileChanges per match,
      // so we treat each snapshot's list as the canonical set since start).
      for (const change of s.tileChanges) {
        mapRef.current.tiles[change.y * mapRef.current.width + change.x] = change.kind;
      }
      const prev = snapshotsRef.current.curr;
      snapshotsRef.current = {
        prev,
        curr: s,
        prevAt: snapshotsRef.current.receivedAt,
        receivedAt: now,
      };
      planeRef.current = s.plane;
      setHudSnapshot(s);
    };
    const onWall = (payload: { x: number; y: number }): void => {
      const m = mapRef.current;
      m.tiles[payload.y * m.width + payload.x] = 'empty' as TileKind;
    };
    socket.on('state', onState);
    socket.on('event:wall_destroyed', onWall);
    return () => {
      socket.off('state', onState);
      socket.off('event:wall_destroyed', onWall);
    };
  }, []);

  // Input wiring + input upload loop.
  useEffect(() => {
    const ic = inputRef.current;
    ic.attach();
    const socket = getSocket();
    const inputInterval = window.setInterval(() => {
      socket.emit('input', ic.snapshot());
    }, 1000 / 30);
    return () => {
      ic.dispose();
      window.clearInterval(inputInterval);
    };
  }, []);

  // Canvas setup + RAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = configureCanvas(canvas);

    let raf = 0;
    const SERVER_TICK_MS = 1000 / 30;
    const draw = (): void => {
      const now = performance.now();
      const snaps = snapshotsRef.current;
      // Interpolate between previous and current snapshot. We aim to render
      // 1 tick in the past for a smoother feel (poor man's entity interpolation).
      const renderTime = now - SERVER_TICK_MS;
      let alpha = 1;
      if (snaps.prev) {
        const dt = snaps.receivedAt - snaps.prevAt;
        if (dt > 0) alpha = Math.min(1, Math.max(0, (renderTime - snaps.prevAt) / dt));
      }
      renderFrame({
        ctx,
        map: mapRef.current,
        snapshot: snaps.curr,
        prevSnapshot: snaps.prev,
        alpha,
        youId,
        plane: planeRef.current,
        now,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [youId]);

  const aspect = useMemo(() => WORLD_WIDTH / WORLD_HEIGHT, []);

  return (
    <div className="game-screen">
      <HUD snapshot={hudSnapshot} youId={youId} lobby={lobby} />
      <div className="canvas-frame" style={{ aspectRatio: aspect }}>
        <canvas ref={canvasRef} className="game-canvas" />
      </div>
      <VirtualJoystick
        onChange={(dir) => inputRef.current.setJoystick(dir)}
        onFire={(down) => inputRef.current.setFire(down)}
      />
    </div>
  );
}

function cloneMap(m: MapData): MapData {
  return { width: m.width, height: m.height, tiles: m.tiles.slice() };
}
