import { normalizeText } from '../util.js';

export interface LocalVerdict {
  blocked: boolean;
  category: string;
  reason: string | null;
}

function normalizeForFilter(text: string): string {
  return normalizeText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9@.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SLURS = [
  'connard',
  'connasse',
  'salope',
  'pute',
  'putain',
  'encule',
  'enculé',
  'batard',
  'bâtard',
  'fdp',
  'ntm',
  'tapette',
  'pede',
  'pédé',
  'attarde',
  'attardé',
  'nique ta mere',
  'nique ta mère',
  'ferme ta gueule',
  'ta gueule',
  'tg',
];

const TARGETED_INSULT =
  /\b(?:t es|tu es|vous etes|il est|elle est|ils sont|elles sont)\s+(?:vraiment\s+|trop\s+)?(?:nul|nulle|nuls|nulles|con|conne|cons|debile|débile|stupide|bete|bête|moche|laid|laide|gros|grosse)\b/i;

const EXCLUSION =
  /\b(?:degage|dégage|barre toi|casse toi|personne ne t aime|personne ne t aime|on veut pas de toi|tu sers a rien|tu sers à rien|retourne chez toi)\b/i;

const FAMILY_INSULT =
  /\b(?:ta mere|ta maman|ta soeur|ta famille)\b.*\b(?:grosse|gros|moche|conne|nulle|debile|débile|sale)\b/i;

const THREAT =
  /\b(?:je vais te tuer|je vais te frapper|je vais te casser|je te tue|je te frappe|tu vas voir ce que je vais faire|je vais te faire mal|on va te casser)\b/i;

const PHONE = /\b0[1-9](?:[\s.-]?\d{2}){4}\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/;
const ADDRESS = /\b\d{1,3}\s+(?:rue|avenue|boulevard|chemin|impasse|place|allee|allée)\b/i;
const ADDRESS_PHRASE = /\b(?:j habite|j'habite|mon adresse|je vis au|je vis a|je vis à|mon numero|mon numéro)\b/i;

export function localFilter(text: string): LocalVerdict {
  const normalized = normalizeForFilter(text);
  if (SLURS.some((word) => normalized.includes(word))) {
    return {
      blocked: true,
      category: 'insulte',
      reason: 'Ce message contient une insulte. Essaie de reformuler sans agresser ton coéquipier.',
    };
  }
  if (TARGETED_INSULT.test(normalized) || FAMILY_INSULT.test(normalized)) {
    return {
      blocked: true,
      category: 'insulte',
      reason: 'Ce message est moqueur ou insultant. Parle du problème, pas de la personne.',
    };
  }
  if (EXCLUSION.test(normalized)) {
    return {
      blocked: true,
      category: 'harcelement',
      reason: 'Ce message peut exclure un coéquipier. Une équipe a besoin de tout le monde.',
    };
  }
  if (THREAT.test(normalized)) {
    return {
      blocked: true,
      category: 'menace',
      reason: 'Ce message est menaçant. Le professeur est prévenu.',
    };
  }
  if (PHONE.test(text) || EMAIL.test(text) || ADDRESS.test(text) || ADDRESS_PHRASE.test(normalized)) {
    return {
      blocked: true,
      category: 'donnees',
      reason: 'Ne partage pas tes coordonnées personnelles dans le chat.',
    };
  }
  return { blocked: false, category: 'ok', reason: null };
}
