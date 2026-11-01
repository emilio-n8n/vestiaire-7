import { describe, expect, it } from 'vitest';
import { normalizeAnswer, normalizeText, parseStudentList, toCsv } from '../src/server/util';

describe('utilitaires', () => {
  it('normalise une réponse avec accents et ponctuation', () => {
    expect(normalizeAnswer('  Équipe ! ')).toBe('equipe');
    expect(normalizeAnswer('3 2 7 6 9')).toBe('32769');
  });

  it('nettoie les espaces et les caractères de contrôle', () => {
    expect(normalizeText('  Lina\u0000   la   joueuse  ')).toBe('Lina la joueuse');
  });

  it('parse une liste Équipe;Prénom', () => {
    const result = parseStudentList('Les Ailiers;Lina\nLes Ailiers;Noah\nLes Pivots;Sami');
    expect(result.errors).toHaveLength(0);
    expect(result.students).toHaveLength(3);
    expect(result.students[0]).toEqual({ team: 'Les Ailiers', name: 'Lina' });
  });

  it('signale une ligne incomplète', () => {
    const result = parseStudentList('Les Ailiers;Lina\nPasDePrénom');
    expect(result.errors).toHaveLength(1);
    expect(result.students).toHaveLength(1);
  });

  it('produit un CSV avec BOM et séparateur point-virgule', () => {
    const csv = toCsv([
      ['Équipe', 'Joueur'],
      ['Les Ailiers', 'Lina'],
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Les Ailiers;Lina');
  });
});
