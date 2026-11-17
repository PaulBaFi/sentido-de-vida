-- Historial: aplicada en Supabase durante la Fase 3.2E. NO REAPLICAR.
-- Preparada originalmente en Fase 3.2B; cuerpo SQL aplicado sin cambios.
-- No contiene credenciales. No ejecutar desde startup/build/tests.
-- Requiere aprobación humana y operador de migraciones autorizado.
BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('usuarios.perfiles') AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Prerequisito ausente: usuarios.perfiles con RLS habilitado';
  END IF;
END;
$guard$;

-- Fallar si ya existe: no adoptar silenciosamente una identidad desconocida.
CREATE ROLE sdv_users_app
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD NULL;
GRANT CONNECT ON DATABASE postgres TO sdv_users_app;
GRANT USAGE ON SCHEMA usuarios TO sdv_users_app;
GRANT SELECT (id, nombres, apellidos, rol, activo)
  ON TABLE usuarios.perfiles TO sdv_users_app;

ALTER ROLE sdv_users_app SET search_path = pg_catalog;
ALTER ROLE sdv_users_app SET row_security = on;
ALTER ROLE sdv_users_app SET statement_timeout = '2s';
ALTER ROLE sdv_users_app SET lock_timeout = '500ms';
ALTER ROLE sdv_users_app SET idle_in_transaction_session_timeout = '5s';

CREATE POLICY sdv_users_app_perfil_propio
  ON usuarios.perfiles FOR SELECT TO sdv_users_app
  USING (id = NULLIF(pg_catalog.current_setting('app.auth_subject', true), '')::uuid);

-- AND obligatorio, incluso si existe otra política permisiva dirigida a PUBLIC.
CREATE POLICY sdv_users_app_perfil_limite
  ON usuarios.perfiles AS RESTRICTIVE FOR SELECT TO sdv_users_app
  USING (id = NULLIF(pg_catalog.current_setting('app.auth_subject', true), '')::uuid);

CREATE TABLE usuarios.auditoria_accesos (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  recurso_id uuid NOT NULL,
  operacion text NOT NULL CHECK (operacion = 'users.profile.read'),
  policy_version text NOT NULL CHECK (pg_catalog.length(policy_version) BETWEEN 1 AND 80),
  resultado text NOT NULL CHECK (resultado = 'allowed'),
  fecha timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (recurso_id = actor_id)
);
ALTER TABLE usuarios.auditoria_accesos ENABLE ROW LEVEL SECURITY;

-- Neutralizar defaults exclusivamente de la tabla nueva, sin cambiar los del esquema.
REVOKE ALL ON TABLE usuarios.auditoria_accesos
  FROM PUBLIC, anon, authenticated, svc_usuarios;
GRANT INSERT (request_id, actor_id, recurso_id, operacion, policy_version, resultado)
  ON TABLE usuarios.auditoria_accesos TO sdv_users_app;

CREATE POLICY sdv_users_app_auditoria_insert
  ON usuarios.auditoria_accesos FOR INSERT TO sdv_users_app
  WITH CHECK (
    actor_id = NULLIF(pg_catalog.current_setting('app.auth_subject', true), '')::uuid
    AND recurso_id = actor_id
    AND operacion = 'users.profile.read'
    AND resultado = 'allowed'
  );

COMMIT;
-- PASSWORD NULL no aprovisiona contraseña; hacerlo luego por canal privado aprobado.
-- No hay membresías svc_*, BYPASSRLS, permisos cruzados ni concesiones a la web.
