import { config } from './config.js';

interface Connection {
  gameId: string;
  teamId: string;
  sockets: Set<string>;
  offlineTimer: NodeJS.Timeout | null;
}

type ChangeHandler = (gameId: string, teamId: string) => void;

class PresenceStore {
  private connections = new Map<string, Connection>();
  private onChange: ChangeHandler | null = null;

  setChangeHandler(handler: ChangeHandler): void {
    this.onChange = handler;
  }

  connect(playerId: string, gameId: string, teamId: string, socketId: string): void {
    const existing = this.connections.get(playerId);
    if (existing) {
      if (existing.offlineTimer) {
        clearTimeout(existing.offlineTimer);
        existing.offlineTimer = null;
      }
      existing.sockets.add(socketId);
      existing.gameId = gameId;
      existing.teamId = teamId;
      this.emit(gameId, teamId);
      return;
    }
    this.connections.set(playerId, {
      gameId,
      teamId,
      sockets: new Set([socketId]),
      offlineTimer: null,
    });
    this.emit(gameId, teamId);
  }

  disconnect(playerId: string, socketId: string): void {
    const connection = this.connections.get(playerId);
    if (!connection) return;
    connection.sockets.delete(socketId);
    if (connection.sockets.size > 0) {
      this.emit(connection.gameId, connection.teamId);
      return;
    }
    if (connection.offlineTimer) return;
    connection.offlineTimer = setTimeout(() => {
      const current = this.connections.get(playerId);
      if (!current || current.sockets.size > 0) return;
      this.connections.delete(playerId);
      this.emit(current.gameId, current.teamId);
    }, config.presenceGraceMs);
    this.emit(connection.gameId, connection.teamId);
  }

  isConnected(playerId: string): boolean {
    const connection = this.connections.get(playerId);
    return Boolean(connection && (connection.sockets.size > 0 || connection.offlineTimer));
  }

  isTeamComplete(teamId: string, playerIds: string[]): boolean {
    return playerIds.length > 0 && playerIds.every((id) => this.isConnected(id));
  }

  connectedPlayerIds(gameId: string): Set<string> {
    const out = new Set<string>();
    for (const [playerId, connection] of this.connections) {
      if (connection.gameId !== gameId) continue;
      if (connection.sockets.size > 0 || connection.offlineTimer) out.add(playerId);
    }
    return out;
  }

  release(playerId: string): void {
    const connection = this.connections.get(playerId);
    if (!connection) return;
    if (connection.offlineTimer) clearTimeout(connection.offlineTimer);
    this.connections.delete(playerId);
    this.emit(connection.gameId, connection.teamId);
  }

  shutdown(): void {
    for (const connection of this.connections.values()) {
      if (connection.offlineTimer) clearTimeout(connection.offlineTimer);
    }
    this.connections.clear();
  }

  private emit(gameId: string, teamId: string): void {
    this.onChange?.(gameId, teamId);
  }
}

export const presence = new PresenceStore();
