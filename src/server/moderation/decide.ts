import type { ModerationDecision } from '../../shared/types.js';
import type { LocalVerdict } from './local.js';
import type { JevVerdict } from './jev.js';

const REASONS: Record<string, string> = {
  menace: 'Ce message est menaçant. Le professeur est prévenu.',
  harcelement: 'Ce message peut blesser ou exclure un coéquipier. Reformule-le.',
  donnees: 'Ne partage pas tes coordonnées personnelles dans le chat.',
  impoli: 'Ce message est moqueur. Essaie de parler du problème, pas de la personne.',
  insulte: 'Ce message contient une insulte. Reformule-le avec respect.',
  local: "Ce message n'est pas respectueux. Reformule-le.",
};

function reasonFor(category: string): string {
  return REASONS[category] ?? "Ce message n'est pas respectueux. Reformule-le pour ton équipe.";
}

export function decideModeration(
  local: LocalVerdict,
  jev: JevVerdict | null,
  jevError: string | null = null,
): ModerationDecision {
  if (local.blocked) {
    return {
      action: 'block',
      category: local.category,
      categories: [local.category],
      severity: 2,
      confidence: 1,
      respect: 0,
      entraide: null,
      source: 'local',
      reason: local.reason ?? reasonFor(local.category),
      flagged: false,
    };
  }

  if (!jev) {
    return {
      action: 'allow',
      category: 'non_verifie',
      categories: ['non_verifie'],
      severity: 0,
      confidence: 0,
      respect: null,
      entraide: null,
      source: 'fallback',
      reason: null,
      flagged: true,
      raw: jevError ? { error: jevError } : undefined,
    };
  }

  const category = jev.category;
  const respect = jev.respect;
  const severity = jev.severity;
  const confidence = jev.categoryConfidence;

  const block =
    respect < 0.18 ||
    (['harcelement', 'menace', 'donnees'].includes(category) && confidence >= 0.5) ||
    severity >= 1.8 ||
    (category === 'impoli' && respect < 0.35);

  const flag =
    respect < 0.55 ||
    severity >= 0.8 ||
    (category === 'impoli' && confidence >= 0.5);

  const action: ModerationDecision['action'] = block ? 'block' : flag ? 'flag' : 'allow';

  return {
    action,
    category,
    categories: [category],
    severity,
    confidence,
    respect,
    entraide: jev.entraide,
    source: 'jev',
    reason: block ? reasonFor(category) : null,
    flagged: action === 'flag',
    raw: {
      respect: jev.respect,
      category: jev.category,
      categoryConfidence: jev.categoryConfidence,
      severity: jev.severity,
      severityConfidence: jev.severityConfidence,
      entraide: jev.entraide,
      probabilities: jev.probabilities,
      usage: jev.usage,
      model: jev.model,
      latencyMs: jev.latencyMs,
    },
  };
}
