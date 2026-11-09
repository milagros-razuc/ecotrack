BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM clientes
    GROUP BY lower(nombre)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'La migración 020 detectó nombres de cliente duplicados por lower()';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM usuarios
    GROUP BY lower(username)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'La migración 020 detectó usernames duplicados por lower()';
  END IF;
END
$$;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_nombre_lower
  ON clientes (lower(nombre));

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_username_lower
  ON usuarios (lower(username));

COMMIT;
