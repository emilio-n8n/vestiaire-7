import 'dotenv/config';
import { analyzeWithJev } from '../src/server/moderation/jev.js';
import { config } from '../src/server/config.js';

const samples = [
  'Bravo les gars, on a trouvé le code !',
  "T'es nul, dégage de l'équipe",
  'Je suis nul à ce jeu, aidez-moi svp',
  'Donne-moi ton adresse, je passe te voir',
];

if (!config.jev.apiKey) {
  console.error('JEV_API_KEY est absent. Ajoute-le dans .env (ou utilise le mode local).');
  process.exit(1);
}

console.log(`Modèle : ${config.jev.model}`);
console.log(`Endpoint : ${config.jev.endpoint}`);
console.log('');

for (const message of samples) {
  try {
    const started = Date.now();
    const verdict = await analyzeWithJev(message, {
      teamName: 'Les Ailiers',
      playerName: 'Lina',
      recentMessages: [],
    });
    console.log(
      `${(Date.now() - started).toString().padStart(4)} ms · respect=${verdict.respect.toFixed(2)} · ${verdict.category} (${Math.round(
        verdict.categoryConfidence * 100,
      )} %) · gravité=${verdict.severity.toFixed(2)} · « ${message} »`,
    );
  } catch (error) {
    console.error(`ERREUR · « ${message} » ·`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
