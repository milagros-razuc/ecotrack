ALTER TABLE dispositivos
  ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS firmware_reported_at TIMESTAMPTZ;

-- Reversión manual:
-- ALTER TABLE dispositivos DROP COLUMN IF EXISTS firmware_reported_at;
-- ALTER TABLE dispositivos DROP COLUMN IF EXISTS firmware_version;
