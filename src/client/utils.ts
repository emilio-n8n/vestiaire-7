export type TeamColorKey = 'orange' | 'blue' | 'green' | 'yellow';

export const TEAM_COLORS: Array<{ id: TeamColorKey; label: string }> = [
  { id: 'orange', label: 'Orange' },
  { id: 'blue', label: 'Bleu' },
  { id: 'green', label: 'Vert' },
  { id: 'yellow', label: 'Jaune' },
];

export const MAX_TEAMS = 6;
export const MAX_PLAYERS_PER_TEAM = 8;
export const MAX_TOTAL_PLAYERS = 60;

export const EXAMPLE_LIST = `Les Ailiers;Lina
Les Ailiers;Noah
Les Ailiers;Sami
Les Ailiers;Inès
Les Pivots;Adam
Les Pivots;Jade
Les Pivots;Maël
Les Pivots;Lou
Les Arrières;Yanis
Les Arrières;Emma
Les Arrières;Nolan
Les Arrières;Sarah
Les Gardiens;Théo
Les Gardiens;Maya
Les Gardiens;Gabriel
Les Gardiens;Aya`;

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ParsedTeam {
  name: string;
  players: string[];
}

export interface ParsedList {
  teams: ParsedTeam[];
  errors: string[];
}

export function parseStudentList(raw: string): ParsedList {
  const errors: string[] = [];
  const byKey = new Map<string, ParsedTeam>();
  const lines = raw.split(/\r?\n/);
  let total = 0;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/\s*[;,\t]\s*/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Ligne ${index + 1} : il manque l’équipe ou le prénom (« Équipe;Prénom »).`);
      return;
    }
    const teamName = parts[0].trim();
    const playerName = parts.slice(1).join(' ').trim();
    if (teamName.length < 2 || teamName.length > 40) {
      errors.push(`Ligne ${index + 1} : le nom d’équipe doit faire 2 à 40 caractères.`);
      return;
    }
    if (playerName.length < 2 || playerName.length > 40) {
      errors.push(`Ligne ${index + 1} : le prénom doit faire 2 à 40 caractères.`);
      return;
    }
    const key = teamName.toLocaleLowerCase('fr-FR');
    let team = byKey.get(key);
    if (!team) {
      if (byKey.size >= MAX_TEAMS) {
        errors.push(`Trop d’équipes : ${MAX_TEAMS} maximum.`);
        return;
      }
      team = { name: teamName, players: [] };
      byKey.set(key, team);
    }
    if (team.players.length >= MAX_PLAYERS_PER_TEAM) {
      errors.push(`${team.name} a plus de ${MAX_PLAYERS_PER_TEAM} joueurs.`);
      return;
    }
    if (team.players.some((p) => p.toLocaleLowerCase('fr-FR') === playerName.toLocaleLowerCase('fr-FR'))) {
      errors.push(`Prénom en double dans ${team.name} : ${playerName}.`);
      return;
    }
    team.players.push(playerName);
    total += 1;
  });
  if (byKey.size < 2) errors.push('Il faut au moins 2 équipes.');
  if (total > MAX_TOTAL_PLAYERS) errors.push(`Trop de joueurs : ${MAX_TOTAL_PLAYERS} maximum.`);
  return { teams: [...byKey.values()], errors };
}

export function teamColorLabel(color: string): string {
  return TEAM_COLORS.find((c) => c.id === color)?.label ?? color;
}

export function buildJoinUrl(code: string, teamId?: string): string {
  const base = `${window.location.origin}/j/${encodeURIComponent(code.toUpperCase())}`;
  return teamId ? `${base}?team=${encodeURIComponent(teamId)}` : base;
}

export function isLocalhost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
