import { describe, expect, it } from 'vitest';
import { canStartTeam } from '../src/shared/gate';

const connected = (...ids: string[]) => new Set(ids);

describe('canStartTeam', () => {
  it('ouvre le sas quand la partie est live et que tous les actifs sont connectés', () => {
    expect(
      canStartTeam({
        gameStatus: 'live',
        teamStartedAt: null,
        activePlayerIds: ['a', 'b', 'c', 'd'],
        connectedIds: connected('a', 'b', 'c', 'd'),
      }),
    ).toBe(true);
  });

  it('refuse s’il manque un joueur actif', () => {
    expect(
      canStartTeam({
        gameStatus: 'live',
        teamStartedAt: null,
        activePlayerIds: ['a', 'b', 'c', 'd'],
        connectedIds: connected('a', 'b', 'c'),
      }),
    ).toBe(false);
  });

  it('refuse avant le lancement du professeur', () => {
    expect(
      canStartTeam({
        gameStatus: 'lobby',
        teamStartedAt: null,
        activePlayerIds: ['a'],
        connectedIds: connected('a'),
      }),
    ).toBe(false);
  });

  it('refuse pendant une pause', () => {
    expect(
      canStartTeam({
        gameStatus: 'paused',
        teamStartedAt: null,
        activePlayerIds: ['a'],
        connectedIds: connected('a'),
      }),
    ).toBe(false);
  });

  it('refuse une équipe déjà lancée', () => {
    expect(
      canStartTeam({
        gameStatus: 'live',
        teamStartedAt: 123,
        activePlayerIds: ['a'],
        connectedIds: connected('a'),
      }),
    ).toBe(false);
  });

  it('refuse une équipe sans joueur actif', () => {
    expect(
      canStartTeam({
        gameStatus: 'live',
        teamStartedAt: null,
        activePlayerIds: [],
        connectedIds: connected(),
      }),
    ).toBe(false);
  });

  it('ignore les joueurs absents : seuls les actifs comptent', () => {
    expect(
      canStartTeam({
        gameStatus: 'live',
        teamStartedAt: null,
        activePlayerIds: ['a', 'b', 'c'],
        connectedIds: connected('a', 'b', 'c'),
      }),
    ).toBe(true);
  });
});
