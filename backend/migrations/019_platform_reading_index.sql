BEGIN;

-- The existing idx_lecturas_dispositivo_ts already satisfies the panel query.
-- Create a replacement only when the parent lacks an equivalent definition.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    WHERE i.indrelid = 'lecturas'::regclass
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indnkeyatts = 2
      AND (
        SELECT array_agg(a.attname::text ORDER BY key.ordinality)::text[]
        FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      ) = ARRAY['dispositivo_codigo', 'timestamp']::text[]
      AND (
        SELECT array_agg((i.indoption[key.ordinality - 1] & 1) = 1 ORDER BY key.ordinality)
        FROM unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
      ) = ARRAY[false, true]
  ) THEN
    CREATE INDEX idx_lecturas_dispositivo_ts_platform
      ON lecturas (dispositivo_codigo, timestamp DESC);
  END IF;
END $$;

COMMIT;
