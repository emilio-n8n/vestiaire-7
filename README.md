# Vestiaire 7

Un **escape game-quiz de handball** pour jouer en équipes, à distance. Le professeur ouvre une partie, partage un lien, et chaque équipe entre quand **tous ses joueurs sont connectés**. Un chat d’équipe permet de partager les indices ; **Jev** vérifie chaque message avant sa publication.

Le backend est **100 % local** : Node, Express, Socket.IO et SQLite. Pas de Supabase, pas de service cloud pour les données. Jev est le seul appel externe, et il est optionnel (mode local).

---

## 1. Lancer sur le Mac mini

### Prérequis

- **Node.js 24 ou plus** (`brew install node@24` sur Mac, ou [nodejs.org](https://nodejs.org)).
- **cloudflared** pour le lien public. Le script propose de l’installer avec Homebrew si tu l’as.
- Une connexion internet pour le tunnel et Jev.

### Une seule commande

```bash
git clone <url-du-depot> handball
cd handball
./start.sh
```

> Si le dépôt n’est pas encore sur GitHub, copie le dossier sur le Mac mini puis lance `./start.sh` dedans.

Le script :

1. vérifie Node et cloudflared ;
2. crée le fichier `.env` au premier lancement (mot de passe prof généré, secret de session, clé Jev demandée) ;
3. installe les dépendances et construit l’application ;
4. démarre le backend sur un port libre ;
5. ouvre un tunnel Cloudflare et affiche **l’URL publique** ;
6. teste Jev et affiche son statut ;
7. ouvre **le dashboard admin dans Google Chrome** ;
8. garde le Mac éveillé avec `caffeinate` pendant la session.

À la fin, le terminal affiche :

```text
✓ Backend connecté
✓ Tunnel public : https://...trycloudflare.com
✓ Dashboard     : https://...trycloudflare.com/admin
✓ Jev           : connecté
✓ Mot de passe  : ...
```

**L’URL change à chaque lancement.** C’est volontaire : le lien d’une classe ne circule pas vers une autre. Partage l’URL et le code d’accès au début du cours. Le Mac mini doit rester allumé et connecté pendant la partie ; `start.sh` s’en occupe avec `caffeinate`.

> Pour un lien stable, il faut un nom de domaine et un tunnel Cloudflare nommé. Ce n’est pas nécessaire pour démarrer.

### Mot de passe et clé Jev

Le script génère un mot de passe professeur et l’écrit dans `.env` :

```bash
ADMIN_PASSWORD=...
SESSION_SECRET=...
JEV_API_KEY=...
JEV_MODEL=jev-1.13-free
```

- Change `ADMIN_PASSWORD` quand tu veux (puis relance `./start.sh`).
- La clé Jev est **lue uniquement par le serveur** ; elle n’est jamais envoyée au navigateur.
- Sans clé, l’application démarre en **mode local** : le filtre local (insultes, menaces, téléphone, email) prend le relais et le dashboard l’indique.
- `JEV_MODEL=jev-1.13-free` utilise le modèle gratuit. Tu peux passer à `jev-1.13` si ton compte le permet.

Pour vérifier la clé Jev en dehors de l’application :

```bash
npm run jev:check
```

---

## 2. Utiliser le dashboard

1. Connecte-toi avec le mot de passe affiché par `start.sh`.
2. **Nouvelle partie** → colle la liste des élèves, une ligne par élève :

```text
Les Ailiers;Lina
Les Ailiers;Noah
Les Pivots;Sami
...
```

Le format accepte `;`, `,` ou une tabulation. Tu peux charger un exemple, corriger les couleurs, puis créer la partie.

3. Le dashboard génère :
   - un **lien de classe**,
   - un **lien par équipe** (pratique en sous-salons visio),
   - un **code d’accès à 4 chiffres**,
   - un **QR code**.
4. **Ouvrir le salon** pour autoriser les connexions.
5. Les élèves ouvrent le lien, entrent le code, cliquent leur prénom.
6. Une équipe ne peut entrer que si **tous ses joueurs actifs sont connectés**. Si un élève est absent, marque-le absent dans le dashboard : l’effectif attendu diminue.
7. **Lancer la partie** quand les équipes sont prêtes. Tu peux ensuite mettre en pause, reprendre, envoyer un indice, écrire un message de coach ou terminer. Entre deux séances, utilise **Mettre en pause** : le jeu reprend avec le même lien et les mêmes équipes.
8. Pendant la partie, ouvre **Missions** pour valider ou renvoyer les recherches, voir les sources et les sorties d’écran. En fin de session : **Résultats**, quiz individuels, recherches validées, messages d’entraide, export CSV.

### Le jeu

- Scénario **Le Dernier Match** : **10 salles sur 3 séances** (135 minutes), un code de sortie par salle, un code final à 10 chiffres.
- **5 salles automatiques verrouillées** : règles, sanctions, postes, zone, coup franc. Tous les joueurs actifs doivent cliquer sur « Je suis prêt » et rester sur l’écran. Si un joueur quitte l’écran, la salle se réinitialise et le professeur voit la sortie dans **Missions**.
- **5 salles de recherche web** : histoire, légendes, club local, analyse d’un match, production finale. Les élèves citent 2 sources (3 pour la finale), écrivent 120 à 300 mots (200 à 450 pour le pitch) et **Jev valide** la consigne, les sources et la synthèse. Le professeur peut valider, renvoyer ou commenter dans **Missions**.
- Chaque joueur reçoit **un indice privé différent**. Sans le chat, l’équipe ne peut pas avancer.
- Une salle rapporte 100 points ; un coup de pouce coûte 20 points, une mauvaise réponse 5 points. Le code final rapporte 50 points.
- Après le trophée, chaque élève répond à un **quiz individuel de 10 questions**, en mode verrouillé : rester sur l’écran, sinon la réponse en cours est annulée. Le professeur voit les scores dans **Résultats** et dans le CSV.
- Le contenu est dans `scenarios/dernier-match.json` ; tu peux ajuster les questions, les indices, les sources et les explications.

### Le chat et Jev

Chaque message passe par :

1. un **filtre local** (insultes, menaces, téléphone, email, adresse) ;
2. **Jev**, qui renvoie des probabilités de respect, une catégorie et une gravité ;
3. une **décision dans le code** : bloqué, publié avec signalement, ou publié.

Les messages bloqués ne sont **jamais montrés à l’équipe** ; l’élève reçoit une explication pour reformuler, et le professeur les voit dans **Modération**. Il peut autoriser un faux positif ou masquer un message signalé. Les messages du coach sont publiés directement, sans Jev.

Le chat est **visible par le professeur** et annoncé aux élèves. Les élèves peuvent signaler un message avec le petit drapeau.

---

## 3. Données et vie privée

- Pas de compte élève, pas d’email, pas de téléphone : uniquement un prénom/pseudo fourni par le professeur.
- Le chat est visible par le professeur (protection des mineurs) et les élèves en sont informés.
- Les messages du chat envoyés à Jev contiennent le texte, les 3 messages précédents, le prénom, le nom de l’équipe et la tranche d’âge. Les recherches envoyées à Jev contiennent la consigne, le texte, les sources et le prénom. Pas d’adresse IP, pas de nom complet.
- Les données sont stockées dans `data/vestiaire.db` (SQLite). Pense à sauvegarder ce fichier.
- Suppression automatique des parties après **30 jours** (`RETENTION_DAYS`). Tu peux aussi supprimer une partie depuis le dashboard.
- Aucune donnée ne part vers Supabase ou un autre backend cloud. Seul Jev (OpenCode Zen) reçoit les messages à modérer, et uniquement si une clé est configurée.

En établissement, préviens les élèves et, selon ton cadre, les familles, de l’usage du chat et de la modération par IA. Le mode local permet de jouer sans Jev si l’IA externe n’est pas autorisée.

---

## 4. Développement

```bash
npm install
npm run dev        # serveur + Vite (PORT de .env, 4317 par défaut)
npm run build      # client + serveur de production
npm start          # serveur de production
npm test           # tests Vitest
npm run typecheck
```

Sur cette machine, le lancement de développement passe par `ord deploy` (qui choisit un port libre) ; sur le Mac mini, `./start.sh` est le chemin recommandé.

### Structure

```text
src/
  client/        React, design system, pages élève et admin
  server/        Express, Socket.IO, SQLite, jeu, modération
  shared/        types, schéma de scénario, sas d’équipe
scenarios/       contenu pédagogique (10 salles + quiz individuel)
scripts/         start/demo, simulation, vérification Jev
tests/           tests unitaires
start.sh         la commande unique pour le Mac mini
```

### Choix techniques

- **Un seul processus Node** en production : Express sert le client construit, l’API et Socket.IO sur le même port.
- **SQLite via `node:sqlite`** : aucun module natif à compiler, le fichier `data/vestiaire.db` est facile à sauvegarder.
- **Le serveur est la source de vérité** : présence, sas d’équipe, chrono, réponses, code final, quiz et modération. Les bonnes réponses et la clé Jev ne sont jamais dans le navigateur.
- **Sécurité** : mot de passe prof, cookie httpOnly, validation Zod, rate limits, vérification d’origine, CSP en production, messages rendus en texte brut.
- **Pas de dépendance à Supabase, Lovable Cloud ou un service de base de données.** Le backend local est le seul backend.

---

## 5. Dépannage

| Problème | Piste |
|---|---|
| `cloudflared` manquant | `brew install cloudflared` sur Mac, puis relance `./start.sh`. |
| Le tunnel ne donne pas d’URL | Vérifie internet et le journal `$TMPDIR/vestiaire-7/tunnel.log`. |
| Le serveur ne démarre pas | Regarde `$TMPDIR/vestiaire-7/server.log` ; vérifie Node ≥ 24. |
| Jev « mode local » | La clé `JEV_API_KEY` est absente ou vide dans `.env`. |
| Jev « indisponible » | Vérifie la clé, le réseau, le modèle ; le filtre local continue de protéger le chat. |
| Le lien ne marche pas pour les élèves | Tu as peut-être copié un lien `localhost`. Ouvre le dashboard via l’URL du tunnel, puis copie le lien depuis le dashboard. |
| Un élève est absent | Marque-le absent dans le dashboard ; l’équipe peut entrer avec les joueurs restants. |
| Un message est bloqué à tort | Onglet **Modération** → **Autoriser**. |
| Le Mac s’endort | `start.sh` lance `caffeinate` ; vérifie les réglages d’économie d’énergie. |

Les logs du script sont dans `$TMPDIR/vestiaire-7/` (`server.log`, `tunnel.log`).

---

## 6. Limites connues / suites possibles

- Le tunnel `trycloudflare` change d’URL à chaque lancement. Un tunnel nommé avec domaine stable est possible.
- Le « bilan de cohésion » est représenté par les **messages d’entraide** détectés par Jev et la participation visible dans les résultats. Une analyse de transcript plus poussée (quatre indicateurs) peut être ajoutée ensuite.
- Le mode verrouillé détecte le changement d’onglet, le passage en arrière-plan et la perte de focus de la fenêtre. Il ne peut pas empêcher un élève d’utiliser un **second appareil** ; le professeur voit les sorties d’écran et garde la main.
- La validation Jev est probabiliste : elle vérifie la structure, les sources et la synthèse, pas la vérité de chaque information locale. Le professeur peut toujours valider ou renvoyer une recherche.
- Le contenu est en français et calibré pour des élèves de 4e. Il se modifie dans le fichier de scénario.
- Une seule instance Node et un seul fichier SQLite : parfait pour une classe, pas pour un déploiement multi-établissement sans base partagée.
