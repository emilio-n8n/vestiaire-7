import { afterEach, describe, expect, it } from 'vitest';
import { focus } from '../src/server/focus';

afterEach(() => {
  focus.clearAll();
});

describe('mode verrouillé', () => {
  it('attend tous les joueurs actifs avant d’activer la salle', () => {
    const first = focus.start('a', 'Lina', 'team-1', 'room-1', ['a', 'b']);
    expect(first.active).toBe(false);
    expect(first.ready).toEqual(['a']);
    expect(first.total).toBe(2);

    const second = focus.start('b', 'Noah', 'team-1', 'room-1', ['a', 'b']);
    expect(second.active).toBe(true);
    expect(second.ready.sort()).toEqual(['a', 'b']);
    expect(focus.isActive('team-1', 'room-1')).toBe(true);
  });

  it('signale une sortie d’écran et désactive la salle', () => {
    focus.start('a', 'Lina', 'team-1', 'room-1', ['a', 'b']);
    focus.start('b', 'Noah', 'team-1', 'room-1', ['a', 'b']);
    const lost = focus.lost('a');
    expect(lost?.wasActive).toBe(true);
    expect(lost?.roomId).toBe('room-1');
    expect(focus.isActive('team-1', 'room-1')).toBe(false);
    const snapshot = focus.snapshot('team-1', 'room-1');
    expect(snapshot.lostBy).toBe('Lina');
    expect(snapshot.active).toBe(false);
  });

  it('détecte un heartbeat trop ancien', () => {
    focus.start('a', 'Lina', 'team-1', 'room-1', ['a', 'b']);
    focus.start('b', 'Noah', 'team-1', 'room-1', ['a', 'b']);
    const lost = focus.checkStale(-1);
    expect(lost).toHaveLength(1);
    expect(lost[0]?.teamId).toBe('team-1');
    expect(focus.isActive('team-1', 'room-1')).toBe(false);
  });

  it('gère le verrouillage individuel du quiz', () => {
    focus.start('p1', 'Lina', 'quiz:p1', 'quiz', ['p1']);
    expect(focus.isActive('quiz:p1', 'quiz')).toBe(true);
    const lost = focus.lost('p1');
    expect(lost?.roomId).toBe('quiz');
    expect(focus.isActive('quiz:p1', 'quiz')).toBe(false);
  });

  it('nettoie une équipe', () => {
    focus.start('a', 'Lina', 'team-1', 'room-1', ['a']);
    focus.clearTeam('team-1');
    expect(focus.isActive('team-1', 'room-1')).toBe(false);
    expect(focus.snapshot('team-1', 'room-1').ready).toHaveLength(0);
  });
});
