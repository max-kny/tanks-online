import { useCallback, useMemo, useState, type JSX } from 'react';
import { getSocket } from '../game/socket';
import type { AckResult, LobbyState } from '../game/types';

interface Props {
  state: LobbyState | null;
}

export function Lobby({ state }: Props): JSX.Element {
  const [name, setName] = useState<string>(() => localStorage.getItem('tanks:name') ?? randomName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistName = useCallback((value: string) => {
    setName(value);
    localStorage.setItem('tanks:name', value);
  }, []);

  const handleCreate = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setError(null);
    getSocket().emit('lobby:create', { name }, (res: AckResult<{ code: string }>) => {
      setBusy(false);
      if (!res.ok) setError(res.error);
    });
  }, [busy, name]);

  const handleJoin = useCallback(() => {
    if (busy) return;
    if (!code.trim()) {
      setError('Enter a room code');
      return;
    }
    setBusy(true);
    setError(null);
    getSocket().emit('lobby:join', { code: code.trim().toUpperCase(), name }, (res: AckResult<{ code: string }>) => {
      setBusy(false);
      if (!res.ok) setError(res.error);
    });
  }, [busy, code, name]);

  const handleReady = useCallback((ready: boolean) => {
    getSocket().emit('lobby:ready', { ready });
  }, []);

  const handleStart = useCallback(() => {
    getSocket().emit('lobby:start');
  }, []);

  const handleLeave = useCallback(() => {
    getSocket().emit('lobby:leave');
  }, []);

  const you = useMemo(() => {
    if (!state) return null;
    return state.players.find((p) => p.id === getSocket().id) ?? null;
  }, [state]);

  if (!state) {
    return (
      <div className="lobby">
        <h1 className="title">
          <span className="title-line title-line-1">TANKS</span>
          <span className="title-line title-line-2">ONLINE</span>
        </h1>
        <p className="subtitle">90&apos;S RETRO MULTIPLAYER</p>
        <div className="panel">
          <label className="field">
            <span>NAME</span>
            <input
              value={name}
              maxLength={12}
              onChange={(e) => persistName(e.target.value.toUpperCase())}
              className="pixel-input"
            />
          </label>
          <div className="row">
            <button className="pixel-btn pixel-btn-primary" disabled={busy} onClick={handleCreate}>
              CREATE ROOM
            </button>
          </div>
          <div className="divider">— OR —</div>
          <label className="field">
            <span>JOIN CODE</span>
            <input
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="pixel-input"
              placeholder="ABCD"
            />
          </label>
          <div className="row">
            <button className="pixel-btn" disabled={busy} onClick={handleJoin}>
              JOIN
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
        <footer className="footer">PLAYER 1 + PLAYER 2 &middot; WASD / ARROWS / TAP</footer>
      </div>
    );
  }

  const isHost = !!you?.isHost;
  const canStart = state.players.length === 2 && state.players.every((p) => p.ready) && isHost;

  return (
    <div className="lobby">
      <h2 className="title-small">ROOM</h2>
      <div className="room-code" aria-label="Room code">
        {state.code.split('').map((ch, i) => (
          <span key={i} className="room-code-char">
            {ch}
          </span>
        ))}
      </div>
      <p className="hint">Share this code with the other player</p>
      <div className="panel players">
        {state.players.map((p) => (
          <div key={p.id} className={`player-row ${p.id === you?.id ? 'me' : ''}`}>
            <span className={`color-chip color-${p.color}`} />
            <span className="player-name">
              {p.name}
              {p.isHost && <span className="host-badge"> HOST</span>}
            </span>
            <span className={`ready-pill ${p.ready ? 'on' : 'off'}`}>{p.ready ? 'READY' : 'WAIT'}</span>
          </div>
        ))}
        {state.players.length < 2 && (
          <div className="player-row waiting">
            <span className="color-chip color-empty" />
            <span className="player-name">WAITING FOR PLAYER…</span>
          </div>
        )}
      </div>
      <div className="row">
        <button className="pixel-btn" onClick={() => handleReady(!you?.ready)}>
          {you?.ready ? 'UNREADY' : 'READY'}
        </button>
        {isHost && (
          <button className="pixel-btn pixel-btn-primary" disabled={!canStart} onClick={handleStart}>
            START
          </button>
        )}
        <button className="pixel-btn pixel-btn-danger" onClick={handleLeave}>
          LEAVE
        </button>
      </div>
    </div>
  );
}

function randomName(): string {
  const names = ['ACE', 'IRON', 'STEEL', 'NOVA', 'BLITZ', 'ROGUE', 'TURBO'];
  return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 90 + 10);
}
