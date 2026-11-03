# HTTPS/TLS Contract

- nginx listens on `443` and proxies `/api/dispositivos/enrolar` to
  `backend:3000`.
- Backend port `3000` is internal to the Compose network for this endpoint and is
  not exposed publicly.
- The certificate chain is signed by the same CA represented by
  `codigo-esp32-mosquitto/ecotrack_ca.h`.
- The leaf certificate contains `subjectAltName = DNS:<serverHost>`, where
  `serverHost` is the hostname stored in factory NVS.
- Private key, CSR, certificate and generated nginx config values live outside Git
  and are mounted read-only.
- Firmware uses the embedded CA and hostname verification; `setInsecure()` is
  prohibited.
