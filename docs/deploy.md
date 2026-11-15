# Private preview on the ERPtek VPS

The game is a static site. A GitHub Actions job builds it, runs the gate, and sends the result to the VPS, where nginx serves it behind a shared password. Friends only: never indexed, never public.

Status: the repo side is ready and switched off. Nothing deploys until the one-time setup below is done and the repository variable `DEPLOY_ENABLED` is `true`.

## How it works

- `.github/workflows/deploy-vps.yml` runs on every push to the working branch (docs-only pushes are skipped) and on manual dispatch. It runs `pnpm gate`, packs `dist/`, and pipes the archive over SSH.
- The deploy key can run exactly one thing on the VPS: `deploy/vps/ci-deploy.sh`. The script takes a commit SHA and an archive, checks both, unpacks into `/var/www/thienlong/releases/<sha>`, and switches the `current` link. It keeps the last five releases.
- nginx serves `/var/www/thienlong/current` with basic auth and `X-Robots-Tag: noindex`.
- The cloud development session cannot SSH out, so it only pushes; the job deploys.

The script refuses a bad SHA, an empty or oversized upload (200 MB), an archive with absolute or `..` paths, links or special files, and an archive without `index.html`. In each case the live site is left as it was. This was tested locally, including rollback and pruning.

## One-time setup (owner)

Replace `SUBDOMAIN` with the chosen name throughout.

1. **DNS.** In Cloudflare add an `A` record `SUBDOMAIN` pointing to the VPS IP, DNS only (grey cloud) to start.

2. **Site folder and deploy script on the VPS.**
   ```bash
   sudo mkdir -p /var/www/thienlong/releases && sudo chown -R ubuntu:ubuntu /var/www/thienlong
   mkdir -p ~/thienlong
   ```
   Copy `deploy/vps/ci-deploy.sh` from this repo to `~/thienlong/ci-deploy.sh` and `chmod 755` it.

3. **Deploy key.** On your own machine:
   ```bash
   ssh-keygen -t ed25519 -f thienlong_deploy -N "" -C gh-actions-thienlong
   ```
   Add one line to `~/.ssh/authorized_keys` on the VPS (the public key, restricted to the script):
   ```
   restrict,command="/home/ubuntu/thienlong/ci-deploy.sh" ssh-ed25519 AAAA... gh-actions-thienlong
   ```

4. **Password for friends.**
   ```bash
   sudo apt-get install -y apache2-utils
   sudo htpasswd -c /etc/nginx/thienlong.htpasswd friends
   ```

5. **nginx and certificate.**
   - Put only the port-80 `server` block of `deploy/vps/nginx-site.conf.example` (with the real name) into `/etc/nginx/sites-available/SUBDOMAIN.erptek.net`, symlink it into `sites-enabled`, then `sudo nginx -t && sudo systemctl reload nginx`.
   - `sudo certbot certonly --webroot -w /var/www/html -d SUBDOMAIN.erptek.net`
   - Copy the full file over the same path and reload nginx again.

6. **GitHub → Settings → Secrets and variables → Actions.** Never paste these into a chat.

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `VPS_SSH_KEY` | Contents of the private key `thienlong_deploy` |
   | Secret | `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <vps host>` |
   | Secret | `VPS_HOST` | The VPS host name or IP |
   | Secret | `VPS_USER` | `ubuntu` |
   | Secret | `PREVIEW_BASIC_AUTH` | `friends:<the password>` (for the smoke test) |
   | Variable | `PREVIEW_URL` | `https://SUBDOMAIN.erptek.net` |
   | Variable | `DEPLOY_ENABLED` | `true` |

7. **First deploy.** Actions → Deploy preview → Run workflow. The job ends with a smoke test: the site must answer 401 without the password, serve the game with it, and send the no-index header.

## Day to day

- **Update:** push. The job deploys after the gate passes.
- **Roll back:** Actions → Deploy preview → Run workflow, with an older full commit SHA.
- **Rotate the key:** make a new key, replace the `authorized_keys` line and the `VPS_SSH_KEY` secret.
- **Change the password:** `sudo htpasswd /etc/nginx/thienlong.htpasswd friends`, then update `PREVIEW_BASIC_AUTH`.
- **nginx changes** are made by hand on the VPS; the job never touches host nginx.

## Not verified

The workflow and the nginx config have not run against the real server: there is no subdomain or key yet. The deploy script was tested locally only.
