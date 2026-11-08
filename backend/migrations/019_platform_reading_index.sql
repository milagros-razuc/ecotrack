BEGIN;

-- Index on the partitioned parent table; PostgreSQL propagates it to partitions.
CREATE INDEX IF NOT EXISTS idx_lecturas_dispositivo_ts
  ON lecturas (dispositivo_codigo, timestamp DESC);

COMMIT;
