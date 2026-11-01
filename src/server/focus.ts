import { now } from './util.js';

interface TeamFocus {
  roomId: string;
  requiredIds: string[];
  ready: Map<string, { name: string; lastSeen: number }>;
  active: boolean;
  lostBy: string | null;
  lostAt: number | null;
  startedAt: number;
}

export interface FocusSnapshot {
  required: boolean;
  active: boolean;
  ready: string[];
  total: number;
  lostBy: string | null;
  lostAt: number | null;
}

interface LostResult {
  teamId: string;
  roomId: string;
  playerId: string;
  playerName: string;
  wasActive: boolean;
}

const teams = new Map<string, TeamFocus>();
const players = new Map<string, { teamId: string; roomId: string; lastSeen: number }>();

function emptySnapshot(total = 0): FocusSnapshot {
  return { required: true, active: false, ready: [], total, lostBy: null, lostAt: null };
}

function computeActive(team: TeamFocus): boolean {
  return team.requiredIds.length > 0 && team.requiredIds.every((id) => team.ready.has(id));
}

export const focus = {
  start(
    playerId: string,
    playerName: string,
    teamId: string,
    roomId: string,
    requiredIds: string[],
  ): FocusSnapshot {
    let team = teams.get(teamId);
    if (!team || team.roomId !== roomId) {
      team = {
        roomId,
        requiredIds: [...requiredIds],
        ready: new Map(),
        active: false,
        lostBy: null,
        lostAt: null,
        startedAt: now(),
      };
      teams.set(teamId, team);
    }
    team.requiredIds = [...requiredIds];
    team.ready.set(playerId, { name: playerName, lastSeen: now() });
    players.set(playerId, { teamId, roomId, lastSeen: now() });
    team.active = computeActive(team);
    if (team.active) {
      team.lostBy = null;
      team.lostAt = null;
    }
    return this.snapshot(teamId, roomId);
  },

  heartbeat(playerId: string): void {
    const player = players.get(playerId);
    if (!player) return;
    player.lastSeen = now();
    const team = teams.get(player.teamId);
    if (!team || team.roomId !== player.roomId) return;
    const ready = team.ready.get(playerId);
    if (ready) ready.lastSeen = player.lastSeen;
  },

  lost(playerId: string): LostResult | null {
    const player = players.get(playerId);
    if (!player) return null;
    players.delete(playerId);
    const team = teams.get(player.teamId);
    if (!team || team.roomId !== player.roomId) {
      return { teamId: player.teamId, roomId: player.roomId, playerId, playerName: '', wasActive: false };
    }
    const entry = team.ready.get(playerId);
    const playerName = entry?.name ?? '';
    team.ready.delete(playerId);
    const wasActive = team.active;
    team.active = false;
    if (wasActive) {
      team.lostBy = playerName || 'un joueur';
      team.lostAt = now();
    }
    return { teamId: player.teamId, roomId: player.roomId, playerId, playerName, wasActive };
  },

  snapshot(teamId: string, roomId: string): FocusSnapshot {
    const team = teams.get(teamId);
    if (!team || team.roomId !== roomId) return emptySnapshot();
    const ready = team.requiredIds.filter((id) => team.ready.has(id));
    return {
      required: true,
      active: team.active && computeActive(team),
      ready,
      total: team.requiredIds.length,
      lostBy: team.lostBy,
      lostAt: team.lostAt,
    };
  },

  isActive(teamId: string, roomId: string): boolean {
    const team = teams.get(teamId);
    return Boolean(team && team.roomId === roomId && team.active && computeActive(team));
  },

  clearTeam(teamId: string): void {
    teams.delete(teamId);
    for (const [playerId, player] of players) {
      if (player.teamId === teamId) players.delete(playerId);
    }
  },

  clearAll(): void {
    teams.clear();
    players.clear();
  },

  checkStale(maxAgeMs = 15_000): LostResult[] {
    const lost: LostResult[] = [];
    const timestamp = now();
    for (const [teamId, team] of teams) {
      if (!team.active) continue;
      for (const [playerId, entry] of team.ready) {
        if (timestamp - entry.lastSeen <= maxAgeMs) continue;
        players.delete(playerId);
        team.ready.delete(playerId);
        team.active = false;
        team.lostBy = entry.name || 'un joueur';
        team.lostAt = timestamp;
        lost.push({ teamId, roomId: team.roomId, playerId, playerName: entry.name, wasActive: true });
        break;
      }
    }
    return lost;
  },

  shutdown(): void {
    teams.clear();
    players.clear();
  },
};
