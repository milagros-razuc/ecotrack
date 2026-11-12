# Specification: local and Azure production environments

> **Documento de origen conservado.** Se mantiene el texto y el detalle técnico
> de esta propuesta. Su estado, alcance y seguimiento describen el momento en
> que se escribió; no son el estado actual de producción. Para el estado y la
> evidencia fechada, consultá la [spec SDD 022](../../specs/022-azure-deployment-cicd/spec.md)
> y su [matriz de aceptación](../../specs/022-azure-deployment-cicd/evidence/acceptance.md).
> Las instrucciones operativas actuales están en la [guía de despliegue](../deployment-environments.md).

**Status at time captured:** Proposed for review
**Source:** Requirements stated in the EcoTrack deployment conversation, captured before the SDD replacement branch's implementation commit.
**Scope at time captured:** Prepare configuration and operator instructions for local development and one Azure production VM. This does not create Azure resources or deploy the application.

## Context

EcoTrack currently runs as a Docker Compose application with PostgreSQL,
Mosquitto over TLS, a Node.js API, nginx, and Caddy. Development currently uses
one local configuration. The target production environment is the existing
Azure Linux VM in the student subscription. The available credit and current
project scope do not justify a second staging VM.

The firmware's factory `serverHost` is used for HTTPS device enrolment. The API
then returns the public MQTT hostname and port. Production therefore needs
Caddy to serve HTTPS on both the dashboard hostname and the MQTT hostname, even
though MQTT itself connects directly to Mosquitto.

## Goals

1. Keep one application codebase and provide explicit local and production
   Compose configurations.
2. Isolate local and production secrets, MQTT certificates, persistent data,
   and public port bindings.
3. Make the production network boundary explicit: public HTTP/HTTPS and MQTT
   only; PostgreSQL and application internals stay on the Compose network.
4. Support Cloudflare DNS for `ecotrack.ar`: `app.ecotrack.ar` for the web app
   and `mqtt.ecotrack.ar` for device enrolment and MQTT.
5. Document repeatable commands so local work does not silently inherit the
   production configuration.

## Requirements

### Environment configuration

- **ENV-1:** Shared service definitions live in the base Compose file.
- **ENV-2:** Local and production differences live in separately named Compose
  override files and are selected explicitly with `-f`.
- **ENV-3:** The local environment binds developer ports to loopback.
- **ENV-4:** Production publishes TCP 80/443 for Caddy and TCP 8883 for
  Mosquitto. PostgreSQL 5432, API 3000, and nginx 80 are not published by the
  production override.
- **ENV-5:** Local and production use separate environment files, Caddyfiles,
  MQTT certificate directories, and Compose project names.
- **ENV-6:** Example environment files contain placeholders only. Real env files,
  passwords, private keys, and generated production certificates are excluded
  from Git.

### Domain, TLS, and network

- **NET-1:** `app.ecotrack.ar` resolves to the Azure VM. Keep it DNS-only while
  validating origin HTTPS, then enable Cloudflare proxying after Caddy has a
  publicly trusted certificate. Set Cloudflare origin encryption to Full
  (strict) after that validation.
- **NET-2:** `mqtt.ecotrack.ar` resolves directly to the Azure VM and remains
  DNS-only because the standard Cloudflare proxy does not carry MQTT TCP 8883.
- **NET-3:** Caddy routes both public hostnames to the existing frontend/API
  proxy. HTTPS on the MQTT hostname is needed for the ESP32 enrolment request.
- **NET-4:** The production MQTT broker certificate has `mqtt.ecotrack.ar` in
  its SAN. MQTT broker trust and Caddy HTTPS enrolment trust remain separate
  firmware trust anchors.
- **NET-5:** Azure NSG rules allow 80/443 for web, 8883 for MQTT, and SSH 22 only
  from the administrator's public IP `/32`. TCP 5432 is not allowed.
- **NET-6:** Azure public IP must be static before adding Cloudflare A records.

## Acceptance criteria

- **AC-1:** The local launch command selects only base + local Compose files and
  uses local-only env files and local Caddy configuration.
- **AC-2:** The production launch command selects only base + production
  Compose files and uses production-only env files and production Caddy
  configuration.
- **AC-3:** The production Compose override publishes only ports 80, 443, and
  8883; PostgreSQL has no host port mapping in the base file.
- **AC-4:** Production Caddy serves both `WEB_PUBLIC_HOST` and
  `MQTT_PUBLIC_HOST` with public automatic HTTPS; local Caddy retains its local
  CA behavior.
- **AC-5:** Certificate paths can differ by environment, and the production
  directory is Git-ignored.
- **AC-6:** The README links to an operator guide containing setup, launch,
  validation, network, and data-preservation steps.
- **AC-7:** No real secret or generated private certificate is added to Git.

## Non-goals for this change

- Creating, resizing, or changing any Azure resource.
- Generating certificates or modifying existing local certificate material.
- Activating Cloudflare DNS or changing NIC.ar delegation.
- Creating a GitHub Actions workflow or automatically deploying to Azure.
- Adding a second VM, a staging database, Azure Key Vault, or a managed database.
- Running a production migration or starting containers on Azure.

## Follow-up scope at time captured

1. Review and merge this environment configuration after validating the local
   Compose profile.
2. Activate Cloudflare DNS and verify the static Azure address.
3. Generate production MQTT TLS material and update the ESP32 trust anchors.
4. Deploy manually to the VM and verify web, enrolment, and MQTT paths.
5. Add CI checks on pull requests, then add an Azure-authenticated production
   deployment job after the manual release is stable.
