import { io, type Socket } from 'socket.io-client';
import type {
  AdminToServerEvents,
  AnyServerToClientEvents,
  PlayerToServerEvents,
} from '../shared/types';

export type PlayerSocket = Socket<AnyServerToClientEvents, PlayerToServerEvents>;
export type AdminSocket = Socket<AnyServerToClientEvents, AdminToServerEvents>;

export function connectPlayer(code: string, playerId: string, token: string): PlayerSocket {
  return io({
    auth: { role: 'player', gameCode: code.trim().toUpperCase(), playerId, token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });
}

export function connectAdmin(): AdminSocket {
  return io({
    auth: { role: 'admin' },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  });
}
