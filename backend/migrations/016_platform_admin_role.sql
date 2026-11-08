BEGIN;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS chk_usuarios_rol;

ALTER TABLE usuarios
  ADD CONSTRAINT chk_usuarios_rol
  CHECK (rol IN ('admin', 'comun', 'platform_admin'));

COMMIT;
