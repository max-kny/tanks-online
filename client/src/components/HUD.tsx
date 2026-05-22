import type { JSX } from 'react';
import { GameSnapshot, LobbyState, TankState } from '../game/types';
import { BONUS_LABEL } from '../game/constants';

interface Props {
  snapshot: GameSnapshot;
  youId: string;
  lobby: LobbyState;
}

export function HUD({ snapshot, lobby }: Props): JSX.Element {
  const players = lobby.players;
  return (
    <div className="hud">
      <div className="hud-room">ROOM {lobby.code}</div>
      <div className="hud-players">
        {players.map((p) => {
          const tank: TankState | undefined = snapshot.tanks.find((t) => t.id === p.id);
          return (
            <div key={p.id} className="hud-player">
              <span className={`color-chip color-${p.color}`} />
              <span className="hud-name">{p.name}</span>
              <span className="hud-score">SCORE {tank?.score ?? 0}</span>
              <span className="hud-lives">
                {Array.from({ length: tank?.lives ?? 0 }).map((_, i) => (
                  <span key={i} className="life-pip">▣</span>
                ))}
              </span>
              <BonusStrip tank={tank} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BonusStrip({ tank }: { tank: TankState | undefined }): JSX.Element | null {
  if (!tank) return null;
  const now = Date.now();
  const active: Array<{ kind: keyof typeof BONUS_LABEL; until: number }> = [];
  if (tank.shieldUntil > now) active.push({ kind: 'shield', until: tank.shieldUntil });
  if (tank.rapidUntil > now) active.push({ kind: 'rapid', until: tank.rapidUntil });
  if (tank.speedUntil > now) active.push({ kind: 'speed', until: tank.speedUntil });
  if (tank.tripleUntil > now) active.push({ kind: 'triple', until: tank.tripleUntil });
  if (active.length === 0) return null;
  return (
    <span className="hud-bonuses">
      {active.map((b) => (
        <span key={b.kind} className={`bonus-pill bonus-${b.kind}`}>
          {BONUS_LABEL[b.kind]}
        </span>
      ))}
    </span>
  );
}
