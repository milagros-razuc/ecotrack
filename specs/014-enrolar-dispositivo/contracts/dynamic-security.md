# Dynamic Security Reuse Contract

The endpoint and `scripts/provision-mqtt-dynamic.js` use one adapter. It must:

- connect with the admin credentials from an ignored environment file;
- validate the broker CA and set `rejectUnauthorized: true`;
- subscribe to `$CONTROL/dynamic-security/v1/response` before publishing;
- send `{ "commands": [...] }` with correlation data and enforce a timeout;
- create/delete the deterministic role and client;
- use explicit ACLs:
  - `publishClientSend ecotrack/<device_id>/lecturas allow`;
  - `subscribePattern ecotrack/# deny` priority 0;
  - `subscribePattern ecotrack/<device_id>/# allow` priority 10;
- avoid logging payloads, passwords or dynamic-security state.

Compensation deletes the MQTT client and role when the local transaction cannot
commit. Deletion failures are surfaced as an operational incident, not converted
to success.
