import type { ModerationDecision } from '../../shared/types.js';
import { config } from '../config.js';
import { decideModeration } from './decide.js';
import { analyzeWithJev, JevError, type JevContext, type JevVerdict } from './jev.js';
import { localFilter } from './local.js';

interface HealthState {
  calls: number;
  successes: number;
  failures: number;
  lastError: string | null;
  lastLatencyMs: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

const health: HealthState = {
  calls: 0,
  successes: 0,
  failures: 0,
  lastError: null,
  lastLatencyMs: null,
  lastSuccessAt: null,
  lastFailureAt: null,
};

export interface ModerationResult {
  decision: ModerationDecision;
  latencyMs: number | null;
  error: string | null;
}

export async function moderateMessage(text: string, context: JevContext): Promise<ModerationResult> {
  const local = localFilter(text);
  if (local.blocked) {
    return {
      decision: decideModeration(local, null),
      latencyMs: null,
      error: null,
    };
  }

  if (!config.jev.enabled || !config.jev.apiKey) {
    return {
      decision: decideModeration(local, null, 'Modération Jev désactivée ou clé absente.'),
      latencyMs: null,
      error: 'local-mode',
    };
  }

  health.calls += 1;
  try {
    const verdict = await analyzeWithJev(text, context);
    health.successes += 1;
    health.lastSuccessAt = Date.now();
    health.lastLatencyMs = verdict.latencyMs;
    health.lastError = null;
    return {
      decision: decideModeration(local, verdict),
      latencyMs: verdict.latencyMs,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur Jev inconnue';
    health.failures += 1;
    health.lastFailureAt = Date.now();
    health.lastError = message;
    return {
      decision: decideModeration(local, null, message),
      latencyMs: null,
      error: message,
    };
  }
}

export function getJevHealth() {
  let status: 'ok' | 'degraded' | 'local' | 'error';
  if (!config.jev.enabled || !config.jev.apiKey) {
    status = 'local';
  } else if (health.lastFailureAt && (!health.lastSuccessAt || health.lastFailureAt > health.lastSuccessAt)) {
    status = health.successes > 0 ? 'degraded' : 'error';
  } else {
    status = 'ok';
  }
  return {
    enabled: config.jev.enabled && Boolean(config.jev.apiKey),
    model: config.jev.model,
    status,
    lastError: health.lastError,
    lastLatencyMs: health.lastLatencyMs,
    calls: health.calls,
  };
}

export async function testJev(): Promise<{
  health: ReturnType<typeof getJevHealth>;
  verdict: JevVerdict | null;
  error: string | null;
}> {
  const started = Date.now();
  try {
    const verdict = await analyzeWithJev('Bravo les gars, on a trouvé le code !', {
      teamName: 'Les Ailiers',
      playerName: 'Lina',
      recentMessages: [],
    });
    health.calls += 1;
    health.successes += 1;
    health.lastSuccessAt = Date.now();
    health.lastLatencyMs = Date.now() - started;
    health.lastError = null;
    return { health: getJevHealth(), verdict, error: null };
  } catch (error) {
    const message = error instanceof JevError ? error.message : 'Erreur Jev inconnue';
    health.failures += 1;
    health.lastFailureAt = Date.now();
    health.lastError = message;
    return { health: getJevHealth(), verdict: null, error: message };
  }
}

export { localFilter, decideModeration };
