CREATE TABLE IF NOT EXISTS dispositivos_fabrica (
  device_id VARCHAR(50) PRIMARY KEY,
  factory_secret_hash VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dispositivos_fabrica_enrolled
  ON dispositivos_fabrica (enrolled_at);

COMMENT ON TABLE dispositivos_fabrica IS
  'Hashes de secretos de fábrica importados desde un export externo; nunca almacena secretos en claro.';
