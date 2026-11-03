# HTTPS/TLS Contract

- Caddy listens on `443` and proxies `/api/dispositivos/enrolar` to
  `backend:3000`.
- Backend port `3000` is internal to the Compose network for this endpoint and is
  not exposed publicly.
- In development, Caddy uses `tls internal`; its root CA persists in the named
  `caddy_data` volume and is exported for host-side `curl.exe --cacert`.
- The development Caddy CA is not the firmware CA. Production/physical firmware
  validation continues to require the CA represented by
  `codigo-esp32-mosquitto/ecotrack_ca.h`, SAN `serverHost`, and hostname
  verification without `setInsecure()`.
- Caddy configuration is versioned, while generated CA material remains in the
  Docker volume and outside Git.
