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

const responseSchema = z.object({
  model: z.string().optional(),
  answers: z.object({
    respect: z.object({ type: z.literal('noul'), noul: z.number() }),
    categorie: z.object({
      type: z.literal('choice'),
      choice: z.string(),
      confidence: z.number(),
      probabilities: z.record(z.string(), z.number()).optional(),
    }),
    gravite: z.object({
      type: z.literal('score'),
      score: z.number(),
      confidence: z.number(),
      legend: z.record(z.string(), z.string()).optional(),
    }),
    entraide: z.object({ type: z.literal('noul'), noul: z.number() }).optional(),
  }),
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

export async function analyzeWithJev(message: string, context: JevContext): Promise<JevVerdict> {
  if (!config.jev.enabled) throw new JevError('Jev est désactivé.');
  if (!config.jev.apiKey) throw new JevError('JEV_API_KEY absent.');

  const state = JSON.stringify({
    contexte:
      "Chat d'équipe d'élèves de 4e (13-14 ans) pendant un escape game de handball. Le professeur peut lire le chat.",
    equipe: context.teamName,
    auteur: context.playerName,
    messages_recents: context.recentMessages.slice(-3),
    message,
  });

  const body = {
    model: config.jev.model,
    state,
    questions: {
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
    },
  };

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(config.jev.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.jev.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

  const data = parsed.data;
  return {
    respect: data.answers.respect.noul,
    category: data.answers.categorie.choice,
    categoryConfidence: data.answers.categorie.confidence,
    probabilities: data.answers.categorie.probabilities ?? {},
    severity: data.answers.gravite.score,
    severityConfidence: data.answers.gravite.confidence,
    entraide: data.answers.entraide?.noul ?? null,
    usage: data.usage ?? null,
    latencyMs: Date.now() - started,
    model: data.model ?? config.jev.model,
  };
}
