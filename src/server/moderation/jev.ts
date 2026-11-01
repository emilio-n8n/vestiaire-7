import { z } from 'zod';
import { config } from '../config.js';

export interface JevVerdict {
  respect: number;
  category: string;
  categoryConfidence: number;
  probabilities: Record<string, number>;
  severity: number;
  severityConfidence: number;
  entraide: number | null;
  usage: { input_tokens?: number; output_tokens?: number; cost?: number } | null;
  latencyMs: number;
  model: string;
}

export interface JevAnswer {
  type: string;
  noul?: number;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  score?: number;
  legend?: Record<string, string>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens?: number; output_tokens?: number; cost?: number } | null;
  latencyMs: number;
}

const answerSchema = z.object({
  type: z.string(),
  noul: z.number().optional(),
  choice: z.string().optional(),
  confidence: z.number().optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
  score: z.number().optional(),
  legend: z.record(z.string(), z.string()).optional(),
});

const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), answerSchema),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

export class JevError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JevError';
  }
}

export interface JevContext {
  teamName: string;
  playerName: string;
  recentMessages: string[];
}

export async function callJev(
  state: string,
  questions: Record<string, unknown>,
): Promise<JevResponse> {
  if (!config.jev.enabled) throw new JevError('Jev est désactivé.');
  if (!config.jev.apiKey) throw new JevError('JEV_API_KEY absent.');

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(config.jev.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.jev.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.jev.model,
        state,
        questions,
      }),
      signal: AbortSignal.timeout(config.jev.timeoutMs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur réseau inconnue';
    throw new JevError(`Jev injoignable : ${message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new JevError(`Jev HTTP ${response.status}${text ? ` : ${text.slice(0, 160)}` : ''}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new JevError('Réponse Jev illisible.');
  }

  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    throw new JevError('Réponse Jev au format inattendu.');
  }

  return {
    model: parsed.data.model ?? config.jev.model,
    answers: parsed.data.answers,
    usage: parsed.data.usage ?? null,
    latencyMs: Date.now() - started,
  };
}

export async function analyzeWithJev(message: string, context: JevContext): Promise<JevVerdict> {
  const state = JSON.stringify({
    contexte:
      "Chat d'équipe d'élèves de 4e (13-14 ans) pendant un escape game de handball. Le professeur peut lire le chat.",
    equipe: context.teamName,
    auteur: context.playerName,
    messages_recents: context.recentMessages.slice(-3),
    message,
  });

  const result = await callJev(state, {
    respect: {
      type: 'noul',
      instructions:
        'Le message est-il respectueux, sans insulte, moquerie, menace, harcèlement ou discrimination ?',
    },
    categorie: {
      type: 'choice',
      instructions: 'Quelle catégorie décrit le mieux ce message ?',
      criteria: {
        ok: 'Respectueux et coopératif',
        impoli: 'Impoli ou moqueur',
        harcelement: 'Harcèlement ou exclusion',
        menace: 'Menace ou violence',
        donnees: 'Donnée personnelle (téléphone, adresse, email, réseau social)',
      },
    },
    gravite: {
      type: 'score',
      instructions: 'Quelle est la gravité du problème ?',
      criteria: ['Aucun problème', 'Impoli', 'Harcèlement', 'Menace grave'],
    },
    entraide: {
      type: 'noul',
      instructions: 'Le message aide, encourage ou félicite un coéquipier.',
    },
  });

  const respect = result.answers.respect;
  const categorie = result.answers.categorie;
  const gravite = result.answers.gravite;
  const entraide = result.answers.entraide;
  if (
    !respect ||
    typeof respect.noul !== 'number' ||
    !categorie ||
    typeof categorie.choice !== 'string' ||
    typeof categorie.confidence !== 'number' ||
    !gravite ||
    typeof gravite.score !== 'number' ||
    typeof gravite.confidence !== 'number'
  ) {
    throw new JevError('Réponse Jev incomplète pour le chat.');
  }

  return {
    respect: respect.noul,
    category: categorie.choice,
    categoryConfidence: categorie.confidence,
    probabilities: categorie.probabilities ?? {},
    severity: gravite.score,
    severityConfidence: gravite.confidence,
    entraide: typeof entraide?.noul === 'number' ? entraide.noul : null,
    usage: result.usage,
    latencyMs: result.latencyMs,
    model: result.model,
  };
}
