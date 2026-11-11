# Deployment environments

EcoTrack uses one codebase with separate local and production configuration.
The local environment runs on a developer workstation. Production runs on the
Azure VM. A separate staging VM is intentionally out of scope for the current
student-credit budget.

## Compose files

- `docker-compose.yml` contains shared services, internal networking, persistent
  volumes, and application configuration.
- `compose.local.yml` publishes local-only ports on `127.0.0.1` for PostgreSQL,
  MQTT, and HTTPS.
- `compose.lan.yml` optionally publishes MQTT on the workstation LAN address
  and HTTPS on port `8443` for an ESP32 on the same network.
- `compose.production.yml` publishes only MQTT (`8883`) and Caddy (`80`/`443`).
  PostgreSQL, the API, and nginx remain inside the Docker network.
- `caddy/Caddyfile.local` uses Caddy's local CA for `localhost` and the local
  MQTT hostname.
- `caddy/Caddyfile.production` serves both the dashboard and MQTT hostname over
  publicly trusted HTTPS. This is required because the ESP32 uses its factory
  `serverHost` for HTTPS enrolment before the API returns the MQTT hostname.

Use explicit Compose files. Do not add a default `compose.override.yml`, because
Compose loads that file implicitly and it can accidentally affect production.

## Local setup

1. Copy the example files and create local-only values:

   ```sh
   cp .env.local.example .env.local
   cp backend/.env.local.example backend/.env.local
   ```

2. Set unique local passwords and secrets in those files. For the default local
   web workflow, keep `MQTT_PUBLIC_HOST=mqtt.localhost` and
   `CADDYFILE_PATH=./caddy/Caddyfile.local`.
3. Generate local MQTT certificates using `scripts/generate-mqtt-certs.ps1` with
   the local MQTT hostname, or use the existing local certificate set.
4. Start the local environment:

   ```sh
   docker compose -p ecotrack --env-file .env.local \
     -f docker-compose.yml -f compose.local.yml up -d --build
   ```

5. Open `https://localhost`. Caddy's local CA may need to be trusted on the
   workstation. Do not use the local MQTT CA or Caddy CA in production.

For ESP32 enrolment on the local network, set `LOCAL_LAN_IP` in `.env.local` to
the workstation's current LAN IPv4 address and start with the LAN overlay:

```sh
docker compose -p ecotrack --env-file .env.local \
  -f docker-compose.yml -f compose.local.yml -f compose.lan.yml up -d --build
```

For Arduino IDE, keep the ignored `enrollment_port.local.h` file in the sketch
folder with `#define ECOTRACK_ENROLLMENT_PORT 8443` and compile/upload the
sketch. Without that local file, the firmware defaults to `443` for production.
Keep the factory `serverHost` set
to the workstation LAN IP (without a port), and flash the firmware while
preserving NVS. The device must trust the local Caddy root in `enroll_ca.h`
and the local MQTT CA in `ecotrack_ca.h`. A previously flashed firmware built
for port 443 must be reflashed before local enrolment can work. If the Mac's
LAN address changes, update `LOCAL_LAN_IP`, the factory host, and the local
certificates that contain the IP address.

## Azure production setup

1. Wait for Cloudflare to show the zone as **Active**. Use these records for the
   Azure VM's static public IPv4 address:

   | Record | Cloudflare mode | Use |
   | --- | --- | --- |
   | `A app` | DNS only at first; Proxied (orange cloud) after HTTPS works | Dashboard and API |
   | `A mqtt` | DNS only (gray cloud) at all times | ESP32 enrolment and MQTT on TCP 8883 |

2. In the Azure NSG, allow TCP 80 and 443 from the Internet, TCP 8883 for MQTT,
   and SSH 22 only from the administrator's current public IP `/32`. Do not allow
   TCP 5432.
3. Clone the approved production commit on the VM. Copy
   `.env.production.example` to `.env.production` and
   `backend/.env.production.example` to `backend/.env.production`. Set unique
   production secrets and then restrict both files:

   ```sh
   chmod 600 .env.production backend/.env.production
   ```

   Create `deploy/secrets/mosquitto/passwd` with `mosquitto_passwd -c` for the
   static `backend` user. Enter the same password as `MQTT_PASS` in
   `backend/.env.production`. The shared Compose file mounts this file
   read-only. The file must be readable by the `mosquitto` user inside the
   container; do not pass its password with `-b` or commit the file.

4. Create production MQTT certificates for `mqtt.ecotrack.ar` under
   `deploy/certs/mosquitto/config/certs`. This directory is ignored by Git.
   The broker certificate must include `mqtt.ecotrack.ar` as a SAN. Keep the
   private CA and broker keys only on trusted machines; never commit or log them.
5. Update the ESP32 trust material: `ecotrack_ca.h` must trust the production
   MQTT CA, while `enroll_ca.h` must trust the public CA chain used by Caddy.
   These two trust anchors are separate.
6. Review the merged production configuration, then start it:

   ```sh
   docker compose -p ecotrack-prod --env-file .env.production \
     -f docker-compose.yml -f compose.production.yml config

   docker compose -p ecotrack-prod --env-file .env.production \
     -f docker-compose.yml -f compose.production.yml up -d --build
   ```

7. Check `docker compose ... ps` and the Caddy, backend, Mosquitto, and database
   logs. First test the app over HTTPS while its Cloudflare record is DNS only.
   After Caddy has obtained publicly trusted certificates and the dashboard
   works, change the `app` record to Proxied and set Cloudflare SSL/TLS to
   **Full (strict)**. Leave `mqtt` DNS only. Test `/health`, enrolment, and MQTT
   from the intended clients.

Never run `docker compose down -v` in production: the named PostgreSQL volume
contains the application data. Make a database backup before destructive
maintenance or deleting the VM/resource group.

## Production backups to Azure Blob

The production VM uses its system-assigned managed identity to write to the
private `backups` container in the `stecotrackbackup1311` storage account. It
needs **Storage Blob Data Contributor** on that container. The account uses
Standard LRS, so a second copy outside the region is recommended for a later
disaster-recovery phase. Back up both PostgreSQL and Mosquitto Dynamic Security
state: losing the latter would lose device clients and ACLs even if the
database were restored.

On the VM, after pulling the commit that contains the script, run one manual
backup. The script requires root because Docker access is restricted. It
checks the PostgreSQL archive with `pg_restore --list` and validates the JSON
before uploading. It retains local copies in `/var/backups/ecotrack` so a
failed upload can be investigated and retried. Do not include the MQTT CA key
in this automated backup; keep its separately secured copy offline.

```sh
cd /home/ecotrackadmin/ecotrack
sudo env ECOTRACK_BACKUP_STORAGE_ACCOUNT=stecotrackbackup1311 \
  bash scripts/backup-production.sh
sudo ls -lh /var/backups/ecotrack
AZCOPY_AUTO_LOGIN_TYPE=MSI azcopy list \
  'https://stecotrackbackup1311.blob.core.windows.net/backups'
```

Once the manual run succeeds and both new objects appear in Blob Storage,
schedule it daily on the VM with root's crontab. The VM uses UTC by default;
`03:15` UTC is `00:15` in Argentina. First check with `timedatectl` and adjust
the expression if the VM's timezone differs.

```sh
sudo crontab -e
```

Add this single line:

```cron
15 3 * * * ECOTRACK_BACKUP_STORAGE_ACCOUNT=stecotrackbackup1311 /usr/bin/flock -n /run/lock/ecotrack-backup.lock /bin/bash /home/ecotrackadmin/ecotrack/scripts/backup-production.sh >> /var/log/ecotrack-backup.log 2>&1
```

Check it with `sudo crontab -l` and inspect failures with
`sudo tail -n 80 /var/log/ecotrack-backup.log`. Local files and Azure blobs
currently have no automatic retention policy; review disk use and create an
Azure Blob lifecycle rule after deciding how many daily backups to keep. A
backup is only proven recoverable after a test restore into a separate database
and verification of the Mosquitto JSON; do this before relying on automation.

## CI/CD progression

The workflow in `.github/workflows/ci-deploy.yml` runs tests with a disposable
PostgreSQL database and validates production Compose on pull requests and
`main`. Its deployment job is skipped until the repository variable
`DEPLOY_ENABLED` is set to `true`. The workflow never needs an inbound SSH rule
for GitHub runners. The detailed requirements are in
`docs/specs/azure-vm-cicd.md`.

Before enabling deployment:

1. In Azure, create a **user-assigned managed identity** named
   `id-ecotrack-github` in `rg-ecotrack-demo`, North Central US. This identity
   is for GitHub; keep the VM's existing system-assigned identity for Blob
   backups. Record the new identity's **Client ID** and **Tenant ID**.
2. On the new identity, add a **Federated credential** for GitHub Actions. Set
   organization `milagros-razuc`, repository `ecotrack`, entity type
   **Environment**, environment `production`, and the default audience
   `api://AzureADTokenExchange`. Its subject must be exactly
   `repo:milagros-razuc/ecotrack:environment:production`.
3. In `ecotrack-vm` > **Access control (IAM)**, assign **Virtual Machine
   Contributor** to `id-ecotrack-github` at the **VM scope**, not the resource
   group or subscription. Azure Run Command uses this role to execute the
   deployment script. Review a narrower custom role after the first successful
   release.
4. In GitHub repository **Settings > Environments**, create `production`.
   Restrict deployment branches to `main` and require a reviewer. Under that
   environment's secrets, add `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and
   `AZURE_SUBSCRIPTION_ID`. These are identifiers, not passwords, but keeping
   them in the protected environment makes the OIDC setup explicit.
5. Confirm the CI job passes on `main`. Then in **Settings > Secrets and
   variables > Actions > Variables**, add repository variable
   `DEPLOY_ENABLED=true`. Every subsequent push to `main` will run CI and, if
   it passes, request the production environment review before deployment.
   You can also start the workflow manually from GitHub Actions on `main`.

The deployment job sends `scripts/deploy-production-vm.sh` with the tested
commit SHA through Azure Run Command. On the VM it backs up PostgreSQL and
Mosquitto to Blob, fast-forwards the checkout to that SHA, validates Compose,
builds the backend, applies pending SQL migrations, rebuilds the containers,
and checks origin HTTPS at `/health`. A failure stops
the job and requires diagnosis; it does not automatically restore an older
database. Keep `.env.production`, `backend/.env.production`, and MQTT keys on
the VM, outside Git.
