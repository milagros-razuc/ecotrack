BEGIN;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS es_plataforma BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_plataforma
  ON clientes (es_plataforma)
  WHERE es_plataforma = true;

COMMIT;
