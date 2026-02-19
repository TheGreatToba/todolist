# Déploiement du SaaS sur un VPS (Ubuntu)

## Prérequis sur le VPS

- Node.js 22 (ou 20+)
- pnpm (`npm install -g pnpm`)

## 1. Récupérer le code

```bash
cd ~
git clone https://github.com/TheGreatToba/todolist.git
cd todolist
```

## 2. Variables d'environnement

Créer un fichier `.env` à la racine du projet (copier depuis `.env.example`) :

```bash
cp .env.example .env
nano .env
```

À configurer au minimum :

- **DATABASE_URL** : SQLite en prod `file:./prisma/prod.db` (ou PostgreSQL si tu préfères)
- **JWT_SECRET** : une clé secrète forte et unique (générer avec `openssl rand -base64 32`)
- **NODE_ENV** : `production`
- **PORT** : ex. `8080` (ou laisser 3000)
- **COOKIE_SECURE** : `false` si tu accèdes au site en **HTTP** (ex. `http://IP:3000`) — sinon le login échoue avec « Invalid CSRF token ». Mets `true` ou oublie la variable quand tu passes en HTTPS (nginx).
- **TRUST_PROXY** : `true` si tu mets nginx devant
- **ALLOWED_ORIGINS** : ton domaine ou `http://IP_DU_VPS:3000`, ex. `https://ton-domaine.com`
- **CRON_SECRET** : (optionnel) pour l’endpoint `/api/cron/daily-tasks`
- **SMTP\_\*** : (optionnel) pour les emails (set password, reset password, etc.)

Exemple minimal :

```env
DATABASE_URL="file:./prisma/prod.db"
JWT_SECRET="<générer avec: openssl rand -base64 32>"
NODE_ENV="production"
PORT=8080
TRUST_PROXY=true
ALLOWED_ORIGINS="https://ton-domaine.com"
```

## 3. Installer, build et lancer

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run seed
pnpm start
```

L’app écoute sur le port défini par `PORT` (ex. http://IP_DU_VPS:8080).

Pour garder le processus en arrière-plan sans systemd : `nohup pnpm start &` (déconseillé pour la prod).

## 4. Lancer avec systemd (recommandé)

Cela permet redémarrage automatique et logs propres.

1. Copier le fichier service et adapter si besoin :
   - `User` / `WorkingDirectory` / `EnvironmentFile` si le projet n’est pas dans `/home/ubuntu/todolist`
   - Si Node est installé via nvm : remplacer `ExecStart` par le chemin complet de `node` (ex. `/home/ubuntu/.nvm/versions/node/v22.x.x/bin/node`) ou utiliser un wrapper qui charge nvm

```bash
sudo cp deploy/todolist.service /etc/systemd/system/
sudo nano /etc/systemd/system/todolist.service
```

2. Activer et démarrer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable todolist
sudo systemctl start todolist
sudo systemctl status todolist
```

3. Voir les logs : `journalctl -u todolist -f`

## 5. (Optionnel) Nginx en reverse proxy

Pour servir en HTTPS sur le port 80/443 et laisser Node sur 8080 :

- Installer nginx, configurer un vhost qui `proxy_pass http://127.0.0.1:8080` et gérer le WebSocket pour Socket.IO (`/socket.io`).
- Mettre **TRUST_PROXY=true** et **ALLOWED_ORIGINS** avec ton domaine.

## Résumé des commandes (sans systemd)

```bash
cd ~/todolist
git pull origin master
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

Avec systemd, après un `git pull` et rebuild : `sudo systemctl restart todolist`.
