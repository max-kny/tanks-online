import { useCallback, useEffect, useState, type JSX } from 'react';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';
import { CRTFrame } from './components/CRTFrame';
import { getSocket } from './game/socket';
import { LobbyState, GameSnapshot, MapData } from './game/types';

type Screen =
  | { kind: 'menu' }
  | { kind: 'lobby'; state: LobbyState }
  | { kind: 'playing'; map: MapData; youId: string; initial: GameSnapshot; lobby: LobbyState }
  | { kind: 'ended'; winnerId: string | null; lobby: LobbyState };

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onLobby = (state: LobbyState): void => {
      setScreen((prev) => {
        if (prev.kind === 'playing') return { ...prev, lobby: state };
        if (prev.kind === 'ended') return { ...prev, lobby: state };
        return { kind: 'lobby', state };
      });
    };
    const onGameStart = (payload: { map: MapData; you: string; snapshot: GameSnapshot }): void => {
      setScreen((prev) => {
        const lobby: LobbyState =
          prev.kind === 'lobby' || prev.kind === 'ended'
            ? prev.kind === 'lobby'
              ? prev.state
              : prev.lobby
            : prev.kind === 'playing'
              ? prev.lobby
              : { code: '----', players: [], status: 'playing' };
        return {
          kind: 'playing',
          map: payload.map,
          youId: payload.you,
          initial: payload.snapshot,
          lobby,
        };
      });
    };
    const onGameEnd = (payload: { winnerId: string | null }): void => {
      setScreen((prev) => {
        if (prev.kind !== 'playing') return prev;
        return { kind: 'ended', winnerId: payload.winnerId, lobby: prev.lobby };
      });
    };
    const onError = (msg: string): void => setConnectionError(msg);
    const onConnectError = (err: Error): void => setConnectionError(err.message);
    const onConnect = (): void => setConnectionError(null);

    socket.on('lobby:state', onLobby);
    socket.on('game:start', onGameStart);
    socket.on('game:end', onGameEnd);
    socket.on('error', onError);
    socket.on('connect_error', onConnectError);
    socket.on('connect', onConnect);
    return () => {
      socket.off('lobby:state', onLobby);
      socket.off('game:start', onGameStart);
      socket.off('game:end', onGameEnd);
      socket.off('error', onError);
      socket.off('connect_error', onConnectError);
      socket.off('connect', onConnect);
    };
  }, []);

  const handleBackToLobby = useCallback(() => {
    setScreen((prev) => {
      if (prev.kind === 'ended') return { kind: 'lobby', state: prev.lobby };
      return prev;
    });
  }, []);

  return (
    <CRTFrame>
      {connectionError && <div className="error-banner">⚠ {connectionError}</div>}
      {screen.kind === 'menu' && <Lobby state={null} />}
      {screen.kind === 'lobby' && <Lobby state={screen.state} />}
      {screen.kind === 'playing' && (
        <GameScreen
          map={screen.map}
          youId={screen.youId}
          initialSnapshot={screen.initial}
          lobby={screen.lobby}
        />
      )}
      {screen.kind === 'ended' && (
        <div className="ended-overlay">
          <h1 className="ended-title">{screen.winnerId ? 'VICTORY' : 'DRAW'}</h1>
          <p className="ended-sub">
            {screen.winnerId
              ? (screen.lobby.players.find((p) => p.id === screen.winnerId)?.name ?? 'Player') + ' wins!'
              : 'Nobody won this round'}
          </p>
          <button className="pixel-btn" onClick={handleBackToLobby}>
            BACK TO LOBBY
          </button>
        </div>
      )}
    </CRTFrame>
  );
}
