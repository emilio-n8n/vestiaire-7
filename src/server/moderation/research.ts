import type { ResearchVerdict } from '../../shared/types.js';
import { callJev, JevError } from './jev.js';

export interface ResearchContext {
  roomTitle: string;
  prompt: string;
  instructions: string;
  text: string;
  sources: string[];
  teamName: string;
  playerName: string;
  minWords: number;
  maxWords: number;
  sourcesRequired: number;
}

export async function validateResearchWithJev(context: ResearchContext): Promise<ResearchVerdict> {
  const state = JSON.stringify({
    contexte:
      "Recherche documentaire d'une équipe d'élèves de 4e (13-14 ans) dans un escape game de handball. Le professeur peut relire et corriger la validation.",
    equipe: context.teamName,
    auteur: context.playerName,
    salle: context.roomTitle,
    consigne: context.prompt,
    instructions: context.instructions,
    sources_attendues: context.sourcesRequired,
    sources_fournies: context.sources,
    texte: context.text,
    longueur_attendue: `${context.minWords}-${context.maxWords} mots`,
  });

  const result = await callJev(state, {
    repond: {
      type: 'noul',
      instructions: 'La réponse répond-elle précisément à la consigne de recherche ?',
    },
    sources: {
      type: 'noul',
      instructions:
        'La réponse cite-t-elle au moins le nombre de sources vérifiables demandé (URL, titre, ouvrage) ?',
    },
    synthese: {
      type: 'noul',
      instructions:
        'La réponse est-elle une synthèse personnelle avec vos mots, qui compare ou relie les sources, plutôt qu’un simple copier-coller ?',
    },
    qualite: {
      type: 'score',
      instructions: 'Quelle est la qualité de cette recherche ?',
      criteria: ['Insuffisante', 'Correcte', 'Bonne', 'Très bonne'],
    },
    hors_sujet: {
      type: 'noul',
      instructions: 'La réponse est-elle hors sujet ou ne parle-t-elle pas de handball ?',
    },
    copie: {
      type: 'noul',
      instructions:
        'La réponse semble-t-elle recopiée telle quelle depuis une IA ou un site, sans travail personnel visible ?',
    },
  });

  const repond = result.answers.repond?.noul;
  const sources = result.answers.sources?.noul;
  const synthese = result.answers.synthese?.noul;
  const qualite = result.answers.qualite;
  const horsSujet = result.answers.hors_sujet?.noul;
  const copie = result.answers.copie?.noul;

  if (
    typeof repond !== 'number' ||
    typeof sources !== 'number' ||
    typeof synthese !== 'number' ||
    !qualite ||
    typeof qualite.score !== 'number' ||
    typeof qualite.confidence !== 'number' ||
    typeof horsSujet !== 'number' ||
    typeof copie !== 'number'
  ) {
    throw new JevError('Réponse Jev incomplète pour la recherche.');
  }

  const reasons: string[] = [];
  if (repond < 0.6) reasons.push('Votre réponse ne répond pas assez précisément à la consigne.');
  if (sources < 0.5) reasons.push(`Citez au moins ${context.sourcesRequired} sources vérifiables.`);
  if (synthese < 0.5) reasons.push('Écrivez une synthèse personnelle : comparez les sources, ne recopiez pas.');
  if (qualite.score < 1.5) reasons.push('Développez davantage : dates, exemples, analyse personnelle.');
  if (horsSujet > 0.4) reasons.push('Votre réponse est hors sujet : revenez au handball et à la consigne.');
  if (copie > 0.6) reasons.push('La réponse semble trop générique ou recopiée : le professeur doit vérifier.');

  const approved =
    repond >= 0.6 &&
    sources >= 0.5 &&
    synthese >= 0.5 &&
    qualite.score >= 1.5 &&
    horsSujet <= 0.4 &&
    copie <= 0.6;

  return {
    approved,
    score: qualite.score,
    confidence: qualite.confidence,
    reasons: approved ? ['Recherche validée par Jev.'] : reasons,
    raw: {
      repond,
      sources,
      synthese,
      qualite: qualite.score,
      qualiteConfidence: qualite.confidence,
      horsSujet,
      copie,
      usage: result.usage,
      model: result.model,
      latencyMs: result.latencyMs,
    },
  };
}
