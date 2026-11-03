import { io, Socket } from 'socket.io-client';

// Same origin connection: never hardcode a URL.
// In dev: Vite proxies /socket.io (with ws: true) to 3001.
// In prod: server serves the built client and socket.io on the same port.
export const socket: Socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
});
