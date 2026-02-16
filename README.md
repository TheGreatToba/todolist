# TaskFlow

SaaS de gestion de tâches quotidiennes par poste de travail. Les employés suivent une checklist sur mobile, les managers supervisent en temps réel.

## Prérequis

- Node.js 18+
- **pnpm** (recommandé) — le projet utilise `pnpm-lock.yaml` ; `package-lock.json` est ignoré pour éviter le drift. Si ce fichier réapparaît (autre branche, `npm install` par erreur) : `git rm --cached package-lock.json` puis commit.

## Installation

```bash
# Installer les dépendances
pnpm install

# Copier les variables d'environnement
cp .env.example .env

# Configurer .env (optionnel en dev, les valeurs par défaut fonctionnent)
# Voir section Variables d'environnement ci-dessous
```

## Base de données

### Développement (SQLite)

Par défaut, le projet utilise SQLite. Aucune configuration supplémentaire nécessaire.

```bash
# Créer les tables et appliquer les migrations
pnpm exec prisma migrate deploy

# Remplir avec des données de démo
pnpm seed
```

**Base existante (workstations sans équipe)**  
Après la migration `add_workstation_team_scope`, si des postes n’ont pas de `teamId`, exécuter une fois le backfill pour les rattacher à une équipe (sinon ils n’apparaîtront plus dans les listes manager) :

```bash
pnpm backfill:workstation-team           # applique les mises à jour
pnpm backfill:workstation-team --dry-run # simule et affiche ce qui serait fait (aucune écriture)
```

### Production (PostgreSQL)

Pour la production, utilisez PostgreSQL :

1. Copier le schéma PostgreSQL :
   ```bash
   cp prisma/schema.postgresql.prisma prisma/schema.prisma
   ```

2. Configurer `DATABASE_URL` dans `.env` :
   ```
   DATABASE_URL="postgresql://user:password@host:5432/taskflow?schema=public"
   ```

3. Lancer les migrations :
   ```bash
   pnpm exec prisma migrate deploy
   ```

4. (Optionnel) Seed initial :
   ```bash
   pnpm seed
   ```

## Lancement en local

```bash
# Mode développement (hot reload + Socket.IO temps réel actif)
pnpm dev
```

L'application est accessible sur http://localhost:8080. Le temps réel (mise à jour des tâches sans rechargement) fonctionne dès le mode développement.

### Comptes de démo (après seed)

| Rôle     | Email        | Mot de passe |
|----------|--------------|--------------|
| Manager  | mgr@test.com | password     |
| Employé  | emp@test.com | password     |

## Build et production

```bash
# Build complet (client + serveur)
pnpm build

# Lancer le serveur de production
pnpm start
```

Le serveur écoute sur le port 3000 (ou `PORT` si défini).

## Variables d'environnement

| Variable      | Description                           | Défaut                         |
|---------------|---------------------------------------|--------------------------------|
| DATABASE_URL  | URL de connexion à la base            | `file:./dev.db` (SQLite)       |
| JWT_SECRET    | Clé secrète pour les tokens JWT       | (à changer en production)      |
| CRON_SECRET   | Secret pour l'endpoint cron (optionnel) | -                            |
| NODE_ENV      | Environnement (development/production)| development                    |
| TRUST_PROXY   | `true` si derrière reverse proxy (nginx, load balancer) — requis pour un rate-limit IP correct | - |
| DISABLE_CSRF  | `true` pour désactiver la validation CSRF (dev/staging uniquement — **interdit en production**) | - |

## Runbook exploitation

### TRUST_PROXY et reverse proxy

Le rate-limiting (login, set-password, création employé) s’appuie sur l’IP client. Derrière un proxy, `req.ip` vaut celui du proxy sans `trust proxy`.

**Quand activer** : `TRUST_PROXY=true` dès que l’app est derrière :
- Nginx
- Apache
- Cloudflare
- AWS ALB / Elastic Load Balancer
- Autre reverse proxy / load balancer

**Exemple Nginx** (envoi de `X-Forwarded-For`) :
```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

**Exemple Cloudflare** : activer `TRUST_PROXY=true` ; CF envoie déjà les en-têtes de forwarding.

### Rate-limit : comportement anormal

Si des requêtes légitimes sont bloquées (429) :

1. Vérifier `TRUST_PROXY=true` si l’app est derrière un proxy (sinon tous les utilisateurs partagent l’IP du proxy).
2. Vérifier que le proxy transmet bien `X-Forwarded-For` (ou équivalent).
3. En cas de NAT / IP partagée (entreprise, VPN), le rate-limit peut toucher plusieurs utilisateurs ; envisager d’ajuster les limites via les options d’express-rate-limit si besoin.

### Observabilité : Request ID

Un middleware injecte un ID de corrélation sur chaque requête :
- Priorité : `X-Request-ID` > `X-Correlation-ID` > `X-Amzn-Trace-ID` > UUID généré
- Disponible sur `req.requestId` dans tout le pipeline
- Retourné dans la réponse via le header `X-Request-ID` pour corréler client/serveur et APM

Configurez le proxy pour transmettre `X-Request-ID` (ou `X-Correlation-ID`) afin d’uniformiser le tracing cross-services.

### Logs CSRF (403)

En cas de rejet CSRF, un log structuré est émis :
```json
{"event":"csrf_rejected","requestId":"abc-123","method":"POST","path":"/api/auth/login","reason":"missing_header"}
```
- **requestId** : ID de corrélation. Priorité des headers : `X-Request-ID` > `X-Correlation-ID` > `X-Amzn-Trace-ID` > UUID généré. Le même ID est renvoyé dans le header de réponse `X-Request-ID` pour le tracing cross-services.
- **path** : chemin Express (`req.path`). Si des routers sont montés (ex. `app.use('/api', router)`), le path est relatif au montage (ex. `/auth/login` et non `/api/auth/login`).
- **reason** : `missing_cookie`, `missing_header` ou `mismatch`. Aucun secret n’est loggé.

## Assignation quotidienne des tâches

Les tâches récurrentes doivent être assignées chaque jour. Un endpoint cron est disponible :

```bash
# Appel manuel (sans CRON_SECRET configuré)
curl -X POST http://localhost:8080/api/cron/daily-tasks

# Avec authentification (recommandé en production) - POST uniquement
curl -X POST http://localhost:8080/api/cron/daily-tasks \
  -H "X-Cron-Secret: votre-secret"

# Pour une date spécifique
curl -X POST "http://localhost:8080/api/cron/daily-tasks?date=2025-02-15" \
  -H "X-Cron-Secret: votre-secret"
```

Configurez un cron (cron-job.org, GitHub Actions, ou crontab) pour appeler cet endpoint chaque matin (ex. 6h00).

## Tests

**Prérequis (éviter faux négatifs en CI / en local)** :
- **JWT_SECRET** : requis au chargement du serveur (auth). À définir dans `.env` ou dans l’environnement CI.
- **DATABASE_URL** : requis pour Prisma (génération client + migrations + tests d’intégration). Idem `.env` ou CI.

Sans ces variables, `createApp()` et les specs qui utilisent la base peuvent échouer. En local, un `cp .env.example .env` suffit. Pour les tests d’API (auth, permissions, tâches), exécuter une fois `pnpm seed` pour disposer des comptes de démo (mgr@test.com, emp@test.com).

## Commandes utiles

| Commande        | Description                    |
|-----------------|--------------------------------|
| `pnpm dev`      | Démarre le serveur de dev      |
| `pnpm build`    | Build production               |
| `pnpm start`    | Lance le serveur production    |
| `pnpm seed`     | Remplit la base avec des données de démo |
| `pnpm typecheck`| Vérification TypeScript        |
| `pnpm test`     | Exécute les tests (Vitest)     |

## Architecture

- **Frontend** : React 18, Vite, TailwindCSS, React Router
- **Backend** : Express, Prisma ORM
- **Temps réel** : Socket.IO
- **Auth** : JWT

## Rôles

- **EMPLOYEE** : Voit ses tâches du jour, peut les cocher. Créé par un manager.
- **MANAGER** : Crée postes et employés, définit les tâches, consulte le dashboard temps réel. Peut s'inscrire directement.
