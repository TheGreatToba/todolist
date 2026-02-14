# TaskFlow

SaaS de gestion de tâches quotidiennes par poste de travail. Les employés suivent une checklist sur mobile, les managers supervisent en temps réel.

## Prérequis

- Node.js 18+
- pnpm (recommandé) ou npm

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
# Mode développement (hot reload, temps réel actif)
pnpm dev
```

L'application est accessible sur http://localhost:8080

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

## Assignation quotidienne des tâches

Les tâches récurrentes doivent être assignées chaque jour. Un endpoint cron est disponible :

```bash
# Appel manuel (sans CRON_SECRET configuré)
curl -X POST http://localhost:8080/api/cron/daily-tasks

# Avec authentification (recommandé en production)
curl -X POST http://localhost:8080/api/cron/daily-tasks \
  -H "X-Cron-Secret: votre-secret"

# Pour une date spécifique
curl -X POST "http://localhost:8080/api/cron/daily-tasks?date=2025-02-15" \
  -H "X-Cron-Secret: votre-secret"
```

Configurez un cron (cron-job.org, GitHub Actions, ou crontab) pour appeler cet endpoint chaque matin (ex. 6h00).

## Commandes utiles

| Commande        | Description                    |
|-----------------|--------------------------------|
| `pnpm dev`      | Démarre le serveur de dev      |
| `pnpm build`    | Build production               |
| `pnpm start`    | Lance le serveur production    |
| `pnpm seed`     | Remplit la base avec des données de démo |
| `pnpm typecheck`| Vérification TypeScript        |
| `pnpm test`     | Exécute les tests              |

## Architecture

- **Frontend** : React 18, Vite, TailwindCSS, React Router
- **Backend** : Express, Prisma ORM
- **Temps réel** : Socket.IO
- **Auth** : JWT

## Rôles

- **EMPLOYEE** : Voit ses tâches du jour, peut les cocher. Créé par un manager.
- **MANAGER** : Crée postes et employés, définit les tâches, consulte le dashboard temps réel. Peut s'inscrire directement.
