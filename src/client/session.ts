export type Theme = 'dark' | 'light';

const THEME_KEY = 'v7:theme';
const SESSION_PREFIX = 'v7:session:';

export interface PlayerSession {
  playerId: string;
  token: string;
}

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyStoredTheme(): void {
  document.documentElement.dataset.theme = getStoredTheme();
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage indisponible : le thème reste pour la session en cours.
  }
  document.documentElement.dataset.theme = theme;
}

function sessionKey(code: string): string {
  return `${SESSION_PREFIX}${code.trim().toUpperCase()}`;
}

export function loadSession(code: string): PlayerSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    if (typeof parsed.playerId !== 'string' || typeof parsed.token !== 'string') return null;
    return { playerId: parsed.playerId, token: parsed.token };
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: PlayerSession): void {
  try {
    localStorage.setItem(sessionKey(code), JSON.stringify(session));
  } catch {
    // La session reste en mémoire pour l'onglet courant.
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(sessionKey(code));
  } catch {
    // rien
  }
}
