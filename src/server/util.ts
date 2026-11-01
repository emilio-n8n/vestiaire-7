import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

export function randomPin(): string {
  return String(crypto.randomInt(1000, 10000));
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAnswer(value: string): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeCode(value: string): string {
  return value.replace(/\D/g, '');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface ParsedStudent {
  team: string;
  name: string;
}

export interface ParseListResult {
  students: ParsedStudent[];
  errors: string[];
}

export function parseStudentList(raw: string): ParseListResult {
  const students: ParsedStudent[] = [];
  const errors: string[] = [];
  const lines = raw.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/\s*[;,\t]\s*/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Ligne ${index + 1} : il manque l'équipe ou le prénom (« Équipe;Prénom »).`);
      return;
    }
    const team = normalizeText(parts[0]);
    const name = normalizeText(parts.slice(1).join(' '));
    if (team.length < 2 || team.length > 40) {
      errors.push(`Ligne ${index + 1} : le nom d'équipe doit faire entre 2 et 40 caractères.`);
      return;
    }
    if (name.length < 2 || name.length > 40) {
      errors.push(`Ligne ${index + 1} : le prénom doit faire entre 2 et 40 caractères.`);
      return;
    }
    students.push({ team, name });
  });
  return { students, errors };
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined): string => {
    const text = value == null ? '' : String(value);
    if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(';')).join('\r\n')}\r\n`;
}

export function now(): number {
  return Date.now();
}
