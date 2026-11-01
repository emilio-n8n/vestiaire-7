import { describe, expect, it } from 'vitest';
import { decideModeration } from '../src/server/moderation/decide';
import { localFilter } from '../src/server/moderation/local';
import type { JevVerdict } from '../src/server/moderation/jev';

const allowLocal = { blocked: false, category: 'ok', reason: null };

function jev(overrides: Partial<JevVerdict> = {}): JevVerdict {
  return {
    respect: 0.97,
    category: 'ok',
    categoryConfidence: 0.95,
    probabilities: {},
    severity: 0,
    severityConfidence: 0.9,
    entraide: 0.8,
    usage: null,
    latencyMs: 700,
    model: 'jev-1.13-free',
    ...overrides,
  };
}

describe('filtre local', () => {
  it('bloque une insulte ciblée', () => {
    expect(localFilter("T'es nul, dégage de l'équipe").blocked).toBe(true);
  });

  it('laisse passer une auto-dépréciation', () => {
    expect(localFilter('Je suis nul à ce jeu, aidez-moi').blocked).toBe(false);
  });

  it('bloque une donnée personnelle', () => {
    expect(localFilter('Mon numéro est 06 12 34 56 78').blocked).toBe(true);
  });

  it('laisse passer un code de jeu', () => {
    expect(localFilter('Le code est 32769, essayez !').blocked).toBe(false);
  });

  it('bloque une menace explicite', () => {
    const verdict = localFilter('Je vais te tuer après le cours');
    expect(verdict.blocked).toBe(true);
    expect(verdict.category).toBe('menace');
  });
});

describe('décision de modération', () => {
  it('bloque un respect très bas', () => {
    const decision = decideModeration(allowLocal, jev({ respect: 0.05, category: 'harcelement', categoryConfidence: 0.9 }));
    expect(decision.action).toBe('block');
    expect(decision.reason).toBeTruthy();
  });

  it('bloque une donnée personnelle même avec un respect élevé', () => {
    const decision = decideModeration(allowLocal, jev({ respect: 0.92, category: 'donnees', categoryConfidence: 0.86 }));
    expect(decision.action).toBe('block');
    expect(decision.category).toBe('donnees');
  });

  it('bloque une moquerie avec un respect bas', () => {
    const decision = decideModeration(allowLocal, jev({ respect: 0.02, category: 'impoli', categoryConfidence: 0.95, severity: 1.5 }));
    expect(decision.action).toBe('block');
  });

  it('laisse passer un message respectueux', () => {
    const decision = decideModeration(allowLocal, jev({ respect: 0.97, category: 'ok', severity: 0 }));
    expect(decision.action).toBe('allow');
    expect(decision.flagged).toBe(false);
  });

  it('signale un message limite sans le bloquer', () => {
    const decision = decideModeration(allowLocal, jev({ respect: 0.45, category: 'impoli', categoryConfidence: 0.6, severity: 1 }));
    expect(decision.action).toBe('flag');
    expect(decision.flagged).toBe(true);
  });

  it('bloque si le filtre local a déjà bloqué', () => {
    const decision = decideModeration({ blocked: true, category: 'insulte', reason: 'Insulte' }, jev());
    expect(decision.action).toBe('block');
    expect(decision.source).toBe('local');
  });

  it('replie en mode local si Jev est indisponible', () => {
    const decision = decideModeration(allowLocal, null, 'timeout');
    expect(decision.action).toBe('allow');
    expect(decision.source).toBe('fallback');
    expect(decision.flagged).toBe(true);
  });
});
