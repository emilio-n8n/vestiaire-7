import type { AdminState, CreateGameInput, GameListItem, JoinResponse, RosterResponse } from '../shared/types';

export interface HealthResponse {
  ok: boolean;
  db: string;
  jev: AdminState['jev'];
  now: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Erreur réseau (${response.status}).`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export const api = {
  health() {
    return request<HealthResponse>('/api/health');
  },
  login(password: string) {
    return post<{ ok: true }>('/api/admin/login', { password });
  },
  logout() {
    return post<{ ok: true }>('/api/admin/logout');
  },
  me() {
    return request<{ ok: true }>('/api/admin/me');
  },
  listGames() {
    return request<GameListItem[]>('/api/admin/games');
  },
  createGame(input: CreateGameInput) {
    return post<{ id: string; code: string; pin: string }>('/api/admin/games', input);
  },
  getGame(gameId: string) {
    return request<AdminState>(`/api/admin/games/${encodeURIComponent(gameId)}`);
  },
  openGame(gameId: string) {
    return post<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}/open`);
  },
  launchGame(gameId: string) {
    return post<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}/launch`);
  },
  pauseGame(gameId: string) {
    return post<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}/pause`);
  },
  resumeGame(gameId: string) {
    return post<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}/resume`);
  },
  endGame(gameId: string) {
    return post<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}/end`);
  },
  forceStart(gameId: string, teamId: string) {
    return post<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}/teams/${encodeURIComponent(teamId)}/force-start`);
  },
  hint(gameId: string, teamId: string) {
    return post<{ ok: true; hint: string }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/teams/${encodeURIComponent(teamId)}/hint`,
    );
  },
  broadcast(gameId: string, body: string, teamId?: string) {
    return post<{ ok: true; sent: number }>(`/api/admin/games/${encodeURIComponent(gameId)}/broadcast`, { body, teamId });
  },
  absent(gameId: string, playerId: string, absent: boolean) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/absent`,
      { absent },
    );
  },
  release(gameId: string, playerId: string) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/release`,
    );
  },
  mute(gameId: string, playerId: string, minutes: number) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/mute`,
      { minutes },
    );
  },
  allowMessage(gameId: string, messageId: string) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/messages/${encodeURIComponent(messageId)}/allow`,
    );
  },
  hideMessage(gameId: string, messageId: string) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/messages/${encodeURIComponent(messageId)}/hide`,
    );
  },
  resolveReport(gameId: string, reportId: string) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/reports/${encodeURIComponent(reportId)}/resolve`,
    );
  },
  validateResearch(gameId: string, researchId: string, approved: boolean, comment?: string) {
    return post<{ ok: true }>(
      `/api/admin/games/${encodeURIComponent(gameId)}/research/${encodeURIComponent(researchId)}/validate`,
      { approved, comment },
    );
  },
  deleteGame(gameId: string) {
    return request<{ ok: true }>(`/api/admin/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
  },
  preflightJev() {
    return post<{ health: AdminState['jev']; verdict: unknown; error: string | null }>('/api/admin/preflight/jev');
  },
  roster(code: string, pin: string, teamId?: string) {
    return post<RosterResponse>(`/api/games/${encodeURIComponent(code)}/roster`, { pin, teamId });
  },
  join(code: string, input: { pin?: string; playerId: string; token?: string }) {
    return post<JoinResponse>(`/api/games/${encodeURIComponent(code)}/join`, input);
  },
  exportUrl(gameId: string) {
    return `/api/admin/games/${encodeURIComponent(gameId)}/export.csv`;
  },
};
