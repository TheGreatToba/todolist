# Résumé complet : mise en production du SaaS sur VPS

Document de synthèse pour déployer **Tasty Crousty** (todolist SaaS) sur un VPS et le faire utiliser au quotidien par un client.

---

## 1. Vue d’ensemble du produit

- **Nom** : Tasty Crousty (todolist)
- **Usage** : gestion de tâches quotidiennes par poste de travail. Les employés suivent une checklist (notamment sur mobile), les managers supervisent en temps réel.
- **Stack** : React 18 + Vite + Tailwind + Express + Prisma + PostgreSQL + Socket.IO + JWT.

Références projet : `README.md`, `AGENTS.md`, `docs/DEPLOY-VPS.md`, `docs/PRODUCTION-POSTGRES-RUNBOOK.md`, `docs/CSP.md`, `docs/TESTING.md`.

---

## 2. Prérequis serveur (VPS)

| Élément                 | Version / remarque                          |
| ----------------------- | ------------------------------------------- |
| OS                      | Ubuntu (recommandé)                         |
| Node.js                 | 20+ (22 recommandé)                         |
| Gestionnaire de paquets | **pnpm** (`npm i -g pnpm`)                  |
| Base de données         | PostgreSQL 15+ (même VPS ou service managé) |

---

## 3. Variables d’environnement production

Créer un fichier `.env` à partir de `.env.example`. **Minimum obligatoire** :

| Variable          | Description                          | Exemple                                                                    |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`    | Connexion PostgreSQL                 | `postgresql://app_user:app_password@127.0.0.1:5432/todolist?schema=public` |
| `NODE_ENV`        | Environnement                        | `production`                                                               |
| `JWT_SECRET`      | Secret pour les tokens JWT           | Générer : `openssl rand -base64 32`                                        |
| `TRUST_PROXY`     | Derrière reverse proxy (nginx, etc.) | `true`                                                                     |
| `COOKIE_SECURE`   | Cookies en HTTPS uniquement          | `true`                                                                     |
| `ALLOWED_ORIGINS` | Origines CORS autorisées             | `https://app.client.com`                                                   |
| `PORT`            | Port d’écoute du serveur Node        | `3000`                                                                     |

**Optionnel (cron quotidien)** : si vous utilisez l’assignation automatique des tâches du jour :

| Variable      | Description                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| `CRON_SECRET` | Secret pour appeler `POST /api/cron/daily-tasks` (ex. `openssl rand -base64 32`) |

**Recommandé** : `FRONTEND_URL` / `APP_URL` pour les liens dans les e-mails (réinitialisation mot de passe, etc.).

**E-mail (invitations employés, réinitialisation mot de passe)** : pour que les employés reçoivent le lien pour définir leur mot de passe (ou le lien de réinitialisation), configurez une adresse d’envoi et un serveur SMTP :

| Variable      | Description                                   | Exemple                                                                  |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `EMAIL_FROM`  | Adresse affichée comme expéditeur des e-mails | `noreply@votredomaine.com` ou `Tasty Crousty <noreply@votredomaine.com>` |
| `SMTP_HOST`   | Serveur SMTP                                  | `smtp.gmail.com`, `smtp.ionos.fr`, `smtp.sendgrid.net`, etc.             |
| `SMTP_PORT`   | Port SMTP (souvent 587 ou 465)                | `587`                                                                    |
| `SMTP_SECURE` | `true` pour port 465, `false` pour 587        | `false`                                                                  |
| `SMTP_USER`   | Identifiant SMTP (souvent l’e-mail)           | Votre adresse ou clé API selon fournisseur                               |
| `SMTP_PASS`   | Mot de passe SMTP ou clé d’application        | Mot de passe ou clé fournie par le fournisseur                           |

Sans ces variables, en production les e-mails ne partent pas (ou le serveur utilise un transport de test). L’app n’envoie **jamais** le mot de passe en clair : elle envoie un **lien** pour que l’employé définisse ou réinitialise son mot de passe.

**À ne pas faire en prod** : `DISABLE_CSRF=true` (interdit en production).

---

## 4. Déploiement pas à pas

### 4.1 Cloner et installer

```bash
cd ~
git clone https://github.com/TheGreatToba/todolist.git
cd todolist
pnpm install --frozen-lockfile
```

### 4.2 Configurer l’environnement

```bash
cp .env.example .env
# Éditer .env avec les valeurs production (voir section 3)
```

### 4.3 Build et migrations base

```bash
pnpm run build
pnpm exec prisma migrate deploy
# Optionnel (données de démo) : pnpm run seed
```

### 4.4 Démarrer le serveur (test manuel)

```bash
pnpm start
```

- Serveur sur le port **3000** (ou `PORT`).
- Health checks :
  - `GET /health/live` → processus vivant
  - `GET /health/ready` → processus + base OK

### 4.5 Service systemd (recommandé pour un usage quotidien)

Fichier fourni : `deploy/todolist.service`. Adapter :

- `User` : utilisateur qui possède le projet (ex. `ubuntu` ou `todolist`)
- `WorkingDirectory` : chemin du projet (ex. `/home/ubuntu/todolist` ou `/opt/todolist`)
- `EnvironmentFile` : chemin vers `.env` (ex. `/home/ubuntu/todolist/.env`)
- `ExecStart` : si vous utilisez nvm/fnm, mettre le chemin complet de `node` (ex. `/home/ubuntu/.nvm/versions/node/v22.x.x/bin/node`) et le script : `.../todolist/dist/server/node-build.mjs`

Puis :

```bash
sudo cp deploy/todolist.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable todolist
sudo systemctl start todolist
sudo systemctl status todolist
# Logs : journalctl -u todolist -f
```

---

## 5. Reverse proxy (nginx) et HTTPS

Pour un client en production, l’app doit être en **HTTPS** derrière un reverse proxy.

- Garder `TRUST_PROXY="true"` et `COOKIE_SECURE="true"`.
- Nginx doit transmettre au moins :
  - `X-Forwarded-For`
  - `X-Forwarded-Proto`

Exemple minimal (à adapter selon domaine et certificat) :

```nginx
server {
  listen 443 ssl;
  server_name app.client.com;
  # ssl_certificate / ssl_certificate_key (Let's Encrypt, etc.)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Socket.IO (temps réel) fonctionne avec `Upgrade` / `Connection` ci‑dessus.

---

## 6. Base de données PostgreSQL (production)

- Un seul schéma Prisma : `prisma/schema.prisma` (provider PostgreSQL).
- En production : **uniquement** `pnpm exec prisma migrate deploy`. Ne pas utiliser `migrate reset`.
- En cas d’échec de migration : arrêter le déploiement et restaurer depuis une sauvegarde avant de réessayer.

**Durabilité** (voir `docs/PRODUCTION-POSTGRES-RUNBOOK.md`) : dans `postgresql.conf` :

- `fsync = on`, `synchronous_commit = on`, `full_page_writes = on`
- `wal_level = replica`, `archive_mode = on` et `archive_command` (ex. script `scripts/pg-wal-archive.sh`)

---

## 7. Sauvegardes et restauration

- **Sauvegarde nocturne** : script `scripts/db-backup-nightly.sh` (pg_dump, checksum, rétention, option PITR).
- **Restauration / drill** : script `scripts/db-restore-drill.sh` (restauration logique et/ou PITR).

Exemple cron (à adapter chemins et variables) :

```cron
0 2 * * * cd /opt/todolist && DATABASE_URL='...' BACKUP_ROOT='/var/backups/todolist' ./scripts/db-backup-nightly.sh >> /var/log/todolist-backup.log 2>&1
```

Détails complets : `docs/PRODUCTION-POSTGRES-RUNBOOK.md`.

---

## 8. Assignation quotidienne des tâches (cron métier)

Pour que les tâches récurrentes soient assignées chaque jour automatiquement :

1. Définir `CRON_SECRET` dans `.env`.
2. Appeler chaque matin (ex. 6h00) :

```bash
curl -X POST "https://app.client.com/api/cron/daily-tasks" \
  -H "X-Cron-Secret: <CRON_SECRET>"
```

À configurer via crontab serveur, cron-job.org, GitHub Actions, etc. Sans `CRON_SECRET`, l’endpoint répond 503 (désactivé).

---

## 9. Sécurité et bonnes pratiques

- **CSP** : documentée dans `docs/CSP.md`. Actuellement `style-src` inclut `'unsafe-inline'` pour Radix UI ; le doc décrit les options de durcissement (nonces, report-only).
- **CSRF** : ne pas désactiver en prod ; les cookies de session sont protégés.
- **Rate limit** : login, set-password, création d’employé sont limités ; correct uniquement si `TRUST_PROXY=true` et que le proxy envoie bien l’IP client.
- **Request ID** : header `X-Request-ID` (ou `X-Correlation-ID`) pour tracer les requêtes ; utile pour le support et les logs.

---

## 10. Comptes de démo (après seed)

Si vous exécutez `pnpm run seed` (environnement de démo uniquement) :

| Rôle    | Email        | Mot de passe |
| ------- | ------------ | ------------ |
| Manager | mgr@test.com | password     |
| Employé | emp@test.com | password     |

En production client : ne pas laisser ces comptes ou changer les mots de passe immédiatement.

---

## 11. Commandes utiles (rappel)

| Commande                          | Usage                                    |
| --------------------------------- | ---------------------------------------- |
| `pnpm dev`                        | Dev local (hot reload, port 8080)        |
| `pnpm build`                      | Build production (client + serveur)      |
| `pnpm start`                      | Démarrer le serveur production           |
| `pnpm exec prisma migrate deploy` | Appliquer les migrations (prod)          |
| `pnpm run seed`                   | Données de démo (optionnel)              |
| `pnpm run ci`                     | Gate CI complet (typecheck, seed, tests) |
| `pnpm test:client`                | Tests frontend seuls                     |

---

## 12. Checklist avant mise en prod client

- [ ] VPS avec Node 20+, pnpm, PostgreSQL 15+
- [ ] `.env` avec toutes les variables production (JWT_SECRET, DATABASE_URL, TRUST_PROXY, COOKIE_SECURE, ALLOWED_ORIGINS, PORT)
- [ ] `pnpm run build` et `prisma migrate deploy` OK
- [ ] Service systemd installé et activé, `journalctl -u todolist` sans erreur
- [ ] Nginx (ou autre) en HTTPS avec X-Forwarded-For / X-Forwarded-Proto
- [ ] Health checks : `/health/live` et `/health/ready` répondent OK
- [ ] Cron quotidien configuré (si besoin) avec `CRON_SECRET`
- [ ] Sauvegardes DB planifiées (`db-backup-nightly.sh`) et rétention définie
- [ ] Pas de comptes de démo par défaut ou mots de passe changés
- [ ] (Optionnel) Test de restauration avec `db-restore-drill.sh`

---

## 13. Références rapides

| Document                              | Contenu                                                 |
| ------------------------------------- | ------------------------------------------------------- |
| `README.md`                           | Installation, variables, runbook proxy, cron, tests     |
| `docs/DEPLOY-VPS.md`                  | Déploiement VPS condensé                                |
| `docs/PRODUCTION-POSTGRES-RUNBOOK.md` | Migrations, durabilité, sauvegardes, PITR, restauration |
| `docs/CSP.md`                         | Content Security Policy et durcissement                 |
| `docs/TESTING.md`                     | Conventions de tests (Vitest, RTL, MSW)                 |
| `deploy/todolist.service`             | Unité systemd type                                      |

Ce résumé permet à un technicien ou au client de mettre en production le SaaS sur un VPS et de l’exploiter au quotidien en s’appuyant sur les docs et le code existants.
