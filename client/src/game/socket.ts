import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Lazy-create a single Socket.io connection per page. The Vite dev server
 * proxies /socket.io to the NestJS backend, so we connect to the same origin.
 */
export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) return socket;
  socket = io({
    autoConnect: true,
    transports: ['websocket'],
  });
  return socket;
}

export function disposeSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
