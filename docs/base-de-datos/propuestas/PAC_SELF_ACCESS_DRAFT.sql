-- PROPUESTA PAC. NO APROBADA. NO EJECUTADA. NO EJECUTAR.
-- Todo el SQL se conserva COMENTADO para impedir aplicación accidental.
-- Fuera de database/migrations: no pertenece al historial aplicado.
-- Antes de convertirla en migración: verificar DDL completo, triggers, defaults,
-- ACL efectivas/PUBLIC y RLS de pacientes con autorización de inspección.
-- Coordinar evaluador, preflight, repositorio, auditoría y pruebas: aplicar
-- grants por sí solos hará que el preflight actual rechace el nuevo acceso.
-- No incluye registro, consulta por DNI, consultas_dni ni administración.
/*
BEGIN;

GRANT SELECT (id, perfil_id, nombres, apellidos, telefono, correo, activo)
  ON usuarios.pacientes TO sdv_users_app;
GRANT UPDATE (telefono, correo) ON usuarios.pacientes TO sdv_users_app;

CREATE POLICY sdv_users_app_patient_self_read ON usuarios.pacientes
  AS PERMISSIVE FOR SELECT TO sdv_users_app
  USING (
    activo AND perfil_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.perfiles p
      WHERE p.id = pacientes.perfil_id AND p.activo AND p.rol = 'paciente')
  );
CREATE POLICY sdv_users_app_patient_self_read_limit ON usuarios.pacientes
  AS RESTRICTIVE FOR SELECT TO sdv_users_app
  USING (
    activo AND perfil_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.perfiles p
      WHERE p.id = pacientes.perfil_id AND p.activo AND p.rol = 'paciente')
  );
CREATE POLICY sdv_users_app_patient_self_contact ON usuarios.pacientes
  AS PERMISSIVE FOR UPDATE TO sdv_users_app
  USING (
    activo AND perfil_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.perfiles p
      WHERE p.id = pacientes.perfil_id AND p.activo AND p.rol = 'paciente')
  )
  WITH CHECK (
    activo AND perfil_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.perfiles p
      WHERE p.id = pacientes.perfil_id AND p.activo AND p.rol = 'paciente')
  );
CREATE POLICY sdv_users_app_patient_self_contact_limit ON usuarios.pacientes
  AS RESTRICTIVE FOR UPDATE TO sdv_users_app
  USING (
    activo AND perfil_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.perfiles p
      WHERE p.id = pacientes.perfil_id AND p.activo AND p.rol = 'paciente')
  )
  WITH CHECK (
    activo AND perfil_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.perfiles p
      WHERE p.id = pacientes.perfil_id AND p.activo AND p.rol = 'paciente')
  );

-- La auditoría actual exige actor_id=recurso_id y users.profile.read:
-- no puede representar la ficha (patient.id != profile.id) ni sus cambios.
CREATE TABLE usuarios.auditoria_pacientes (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  operacion text NOT NULL CHECK (operacion IN ('patients.read-self','patients.update-own-contact')),
  resultado text NOT NULL CHECK (resultado='allowed'),
  fecha timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE usuarios.auditoria_pacientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON usuarios.auditoria_pacientes FROM PUBLIC,anon,authenticated,svc_usuarios;
GRANT INSERT (request_id,actor_id,paciente_id,operacion,resultado)
  ON usuarios.auditoria_pacientes TO sdv_users_app;
CREATE POLICY sdv_users_app_patient_audit ON usuarios.auditoria_pacientes
  FOR INSERT TO sdv_users_app
  WITH CHECK (
    actor_id = NULLIF(pg_catalog.current_setting('app.auth_subject',true),'')::uuid
    AND EXISTS (SELECT 1 FROM usuarios.pacientes p
      WHERE p.id=auditoria_pacientes.paciente_id AND p.perfil_id=auditoria_pacientes.actor_id AND p.activo)
    AND resultado='allowed'
    AND operacion IN ('patients.read-self','patients.update-own-contact')
  );

COMMIT;
*/
-- Decisiones pendientes: aprobar acceso propio/columnas, RLS adicional y nueva
-- auditoría; confirmar reglas de contacto y retención. No se concede DELETE,
-- INSERT de pacientes, SELECT de DNI/fecha_nacimiento ni acceso a otros dominios.
