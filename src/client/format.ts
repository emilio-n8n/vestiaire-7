export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count > 1 ? (pluralForm ?? `${singular}s`) : singular;
}

export function gameStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Brouillon';
    case 'lobby':
      return 'Salon ouvert';
    case 'live':
      return 'En cours';
    case 'paused':
      return 'En pause';
    case 'ended':
      return 'Terminée';
    default:
      return status;
  }
}

export function teamStatusLabel(startedAt: number | null, finishedAt: number | null): string {
  if (finishedAt) return 'Terminée';
  if (startedAt) return 'En jeu';
  return 'En attente';
}
