import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  AckResult,
  AirdropState,
  BonusKind,
  BulletState,
  ClientToServerEvents,
  Direction,
  GameSnapshot,
  LobbyState,
  MapData,
  PlaneState,
  PlayerInput,
  ServerToClientEvents,
} from './types';
import { GameRoom, RoomCallbacks } from './room';
import { generateRoomCode } from './util';

/**
 * Owns the lifecycle of all active rooms and routes Socket.io events to them.
 *
 * Server-authority model:
 *  - Clients send their input intent ('input' event) every frame.
 *  - The server simulates the world on a 30Hz tick and broadcasts 'state'.
 *  - The server emits one-shot events (bullet_fired, pickup, …) for SFX/UI.
 *  - Clients render server snapshots with interpolation; they never trust their
 *    own positions for damage/pickups.
 */
@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  private rooms = new Map<string, GameRoom>();
  private socketRoom = new Map<string, string>(); // socket.id → room code

  handleConnection(client: Socket): void {
    this.logger.log(`connected ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`disconnected ${client.id}`);
    const code = this.socketRoom.get(client.id);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    room.removePlayer(client.id);
    this.socketRoom.delete(client.id);
    if (room.size === 0) {
      room.dispose();
      this.rooms.delete(code);
    }
  }

  // --- Lobby events ---

  @SubscribeMessage('lobby:create')
  onCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { name: string },
    // The 3rd Socket.io ack argument is forwarded by NestJS through the return value.
  ): AckResult<{ code: string }> {
    if (this.socketRoom.has(client.id)) {
      return { ok: false, error: 'Already in a room' };
    }
    const room = this.createRoom();
    const res = room.addPlayer(client.id, payload?.name ?? 'Player');
    if (!res.ok) return res;
    client.join(room.code);
    this.socketRoom.set(client.id, room.code);
    return { ok: true, data: { code: room.code } };
  }

  @SubscribeMessage('lobby:join')
  onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string; name: string },
  ): AckResult<{ code: string }> {
    if (this.socketRoom.has(client.id)) {
      return { ok: false, error: 'Already in a room' };
    }
    const code = (payload?.code ?? '').toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found' };
    const res = room.addPlayer(client.id, payload?.name ?? 'Player');
    if (!res.ok) return res;
    client.join(room.code);
    this.socketRoom.set(client.id, room.code);
    return { ok: true, data: { code: room.code } };
  }

  @SubscribeMessage('lobby:leave')
  onLeave(@ConnectedSocket() client: Socket): void {
    const code = this.socketRoom.get(client.id);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    room.removePlayer(client.id);
    void client.leave(code);
    this.socketRoom.delete(client.id);
    if (room.size === 0) {
      room.dispose();
      this.rooms.delete(code);
    }
  }

  @SubscribeMessage('lobby:ready')
  onReady(@ConnectedSocket() client: Socket, @MessageBody() payload: { ready: boolean }): void {
    const room = this.roomFor(client.id);
    room?.setReady(client.id, Boolean(payload?.ready));
  }

  @SubscribeMessage('lobby:start')
  onStart(@ConnectedSocket() client: Socket): void {
    const room = this.roomFor(client.id);
    if (!room) return;
    const res = room.startGame(client.id);
    if (!res.ok && res.error) client.emit('error', res.error);
  }

  @SubscribeMessage('input')
  onInput(@ConnectedSocket() client: Socket, @MessageBody() payload: PlayerInput): void {
    const room = this.roomFor(client.id);
    if (!room || !room.isPlaying) return;
    // Sanitize: coerce to booleans / int, drop unexpected keys.
    const clean: PlayerInput = {
      seq: Number(payload?.seq) || 0,
      up: Boolean(payload?.up),
      down: Boolean(payload?.down),
      left: Boolean(payload?.left),
      right: Boolean(payload?.right),
      fire: Boolean(payload?.fire),
    };
    room.applyInput(client.id, clean);
  }

  private roomFor(socketId: string): GameRoom | undefined {
    const code = this.socketRoom.get(socketId);
    if (!code) return undefined;
    return this.rooms.get(code);
  }

  private createRoom(): GameRoom {
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));
    const room = new GameRoom(this.makeCallbacks(code), code);
    this.rooms.set(code, room);
    return room;
  }

  private makeCallbacks(code: string): RoomCallbacks {
    const to = (): ReturnType<Server['to']> => this.server.to(code);
    return {
      emitLobby: (state: LobbyState) => to().emit('lobby:state', state),
      emitGameStart: ({ map, you, snapshot, socketId }: { map: MapData; you: string; snapshot: GameSnapshot; socketId: string }) => {
        this.server.to(socketId).emit('game:start', { map, you, snapshot });
      },
      emitSnapshot: (snapshot: GameSnapshot) => to().emit('state', snapshot),
      emitBulletFired: (b: BulletState) =>
        to().emit('event:bullet_fired', {
          bulletId: b.id,
          ownerId: b.ownerId,
          x: b.x,
          y: b.y,
          dir: b.dir as Direction,
        }),
      emitPlaneSpawn: (p: PlaneState) => to().emit('event:plane_spawn', p),
      emitAirdropSpawn: (a: AirdropState) => to().emit('event:airdrop_spawn', a),
      emitPickup: (playerId: string, bonus: BonusKind) => to().emit('event:pickup', { playerId, bonus }),
      emitPlayerHit: (victimId: string, attackerId: string) =>
        to().emit('event:player_hit', { victimId, attackerId }),
      emitWallDestroyed: (x: number, y: number) => to().emit('event:wall_destroyed', { x, y }),
      emitGameEnd: (winnerId: string | null) => to().emit('game:end', { winnerId }),
    };
  }
}
