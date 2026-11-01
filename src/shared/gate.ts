export interface StartGateInput {
  gameStatus: string;
  teamStartedAt: number | null;
  activePlayerIds: string[];
  connectedIds: Set<string>;
}

/**
 * Une équipe peut entrer si la partie est live, qu'elle n'a pas commencé,
 * qu'elle a au moins un joueur actif et que tous ses joueurs actifs sont connectés.
 * La grâce de présence est gérée en amont par le PresenceStore.
 */
export function canStartTeam(input: StartGateInput): boolean {
  return (
    input.gameStatus === 'live' &&
    input.teamStartedAt == null &&
    input.activePlayerIds.length > 0 &&
    input.activePlayerIds.every((id) => input.connectedIds.has(id))
  );
}
