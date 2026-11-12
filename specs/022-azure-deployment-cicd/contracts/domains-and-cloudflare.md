# Contract: production domains, DNS, and Cloudflare

This contract records the intended production routing for EcoTrack. It describes the operating design from the source specification and runbook; it does **not** assert that current Cloudflare records, proxy modes, or certificates were live-verified during the 2026-11-12 audit.

## Hostnames and routes

| Hostname | Purpose | DNS target | Cloudflare mode | TLS and traffic |
|---|---|---|---|---|
| `app.ecotrack.ar` | EcoTrack web application and API | A record to the Azure VM's static public IPv4 address | DNS-only while validating the origin certificate; may become Proxied after public HTTPS works | Caddy terminates public HTTPS and routes web/API requests. Cloudflare origin mode is Full (strict) after the origin certificate is valid. |
| `mqtt.ecotrack.ar` | ESP32 HTTPS enrolment and MQTT broker endpoint | A record directly to the Azure VM's static public IPv4 address | DNS-only at all times | Caddy serves HTTPS for enrolment. MQTT/TLS connects directly to Mosquitto on TCP 8883; the broker certificate includes `mqtt.ecotrack.ar` in its SAN. |

Both A records refer to the VM's stable public address. Do not expose PostgreSQL, the backend port, or the frontend port through public DNS/network rules. The production Compose overlay publishes Caddy on 80/443 and Mosquitto on 8883.

## Trust boundaries

- The web and enrolment HTTPS path uses Caddy's publicly trusted certificate chain.
- The MQTT broker uses its own TLS certificate and CA trust anchor; this is separate from the HTTPS enrolment trust anchor in ESP32 firmware.
- The Cloudflare proxy for `app.ecotrack.ar` handles web traffic only. MQTT remains DNS-only so TCP 8883 reaches Mosquitto directly.

## Verification and evidence

Before claiming current DNS/proxy state, verify the live A records, Cloudflare proxy modes, origin HTTPS certificate, and public HTTPS routing for both hostnames from an authorized read-only source. For MQTT, separately verify direct TLS connectivity to `mqtt.ecotrack.ar:8883` and the broker certificate SAN. Record date and outcome without exposing private keys or credentials.

**Audit status (2026-11-12):** The domain names and intended routing are present in the repository and deployment history. This audit did not query Cloudflare DNS/proxy settings or test public TLS/MQTT connectivity, so live routing remains unverified here.

## Source documents

- [Original Azure environment specification](../../../docs/specs/azure-deployment-environments.md)
- [Azure operator guide](../../../docs/deployment-environments.md)
- [Production Compose overlay](../../../compose.production.yml)
- [Acceptance evidence](../evidence/acceptance.md)
