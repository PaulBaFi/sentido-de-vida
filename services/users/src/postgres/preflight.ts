import { UsersFailure } from "../domain/errors.ts";
import { isRecord } from "../domain/profile.ts";
import type { SqlClient, SqlPool } from "./connection.ts";

export const PREFLIGHT_SQL = `SELECT (
  session_user = 'sdv_users_app' AND current_user = 'sdv_users_app'
  AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user
    AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication)
  AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname <> current_user
    AND pg_has_role(current_user, r.oid, 'MEMBER'))
  AND ($1::text = 'session' OR COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false))
  AND has_schema_privilege(current_user, 'usuarios', 'USAGE')
  AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND has_schema_privilege(current_user,n.oid,'CREATE'))
  AND NOT EXISTS (SELECT 1 FROM pg_namespace n
    WHERE n.nspname IN ('catalogo','citas','pagos','notificaciones','administracion','interno')
    AND has_schema_privilege(current_user,n.oid,'USAGE'))
  AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='usuarios.perfiles'::regclass
    AND c.relrowsecurity AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user))
  AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='usuarios.auditoria_accesos'::regclass
    AND c.relrowsecurity AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname=current_user))
  AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='usuarios.perfiles'::regclass
    AND a.attnum>0 AND NOT a.attisdropped AND
    (CASE WHEN a.attname IN ('id','nombres','apellidos','rol','activo')
      THEN NOT has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT')
      ELSE has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT') END))
  AND NOT has_table_privilege(current_user,'usuarios.perfiles','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  AND NOT has_any_column_privilege(current_user,'usuarios.perfiles','UPDATE')
  AND NOT has_any_column_privilege(current_user,'usuarios.perfiles','INSERT,REFERENCES')
  AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='usuarios.auditoria_accesos'::regclass
    AND a.attnum>0 AND NOT a.attisdropped AND
    (CASE WHEN a.attname IN ('request_id','actor_id','recurso_id','operacion','policy_version','resultado')
      THEN NOT has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT')
      ELSE has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT') END))
  AND NOT has_any_column_privilege(current_user,'usuarios.auditoria_accesos','SELECT,UPDATE,REFERENCES')
  AND NOT has_table_privilege(current_user,'usuarios.auditoria_accesos','DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
) AS ok,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'schemaUsage', path.schema_usage, 'objectPrivilege', path.object_privilege,
    'kind', path.kind, 'indirectAccess', path.indirect_access)) FROM (
    SELECT has_schema_privilege(current_user,n.oid,'USAGE') AS schema_usage,
      CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')
        WHEN c.relkind IN ('r','p','v','m','f') THEN
          has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
          OR has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,TRIGGER,MAINTAIN')
        ELSE NULL END AS object_privilege,
      'relation'::text AS kind, false AS indirect_access
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND c.relkind IN ('r','p','v','m','f','S')
      AND c.oid NOT IN ('usuarios.perfiles'::regclass,'usuarios.auditoria_accesos'::regclass)
    UNION ALL
    SELECT has_schema_privilege(current_user,n.oid,'USAGE'),
      has_function_privilege(current_user,p.oid,'EXECUTE'),
      CASE WHEN p.prosecdef THEN 'definer' ELSE 'routine' END,
      EXISTS (SELECT 1 FROM pg_cast cast_path WHERE cast_path.castfunc=p.oid
        AND has_type_privilege(current_user,cast_path.castsource,'USAGE')
        AND has_type_privilege(current_user,cast_path.casttarget,'USAGE'))
      OR EXISTS (SELECT 1 FROM pg_operator operator_path WHERE operator_path.oprcode=p.oid
        AND has_schema_privilege(current_user,operator_path.oprnamespace,'USAGE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  ) AS path), '[]'::jsonb) AS access_paths`;

/** Los privilegios efectivos del catálogo ya incluyen PUBLIC y herencia.
 * Ninguna rutina de aplicación está aprobada: también se deniegan INVOKER,
 * agregados y procedimientos, sin intentar deducir seguridad de su cuerpo.
 * Vistas, tablas foráneas y secuencias no constituyen una ruta alternativa.
 * Casts y operadores pueden invocar rutinas sin resolver su esquema.
 */
export function hasOnlyAuthorizedAccess(paths: unknown): boolean {
  if (!Array.isArray(paths)) return false;
  return paths.every(path => isRecord(path) &&
    typeof path.kind === 'string' && ['relation', 'routine', 'definer'].includes(path.kind) &&
    typeof path.schemaUsage === 'boolean' && typeof path.objectPrivilege === 'boolean' &&
    typeof path.indirectAccess === 'boolean' &&
    !((path.schemaUsage || path.indirectAccess) && path.objectPrivilege));
}

export async function verifyRestrictedDatabase(pool: SqlPool, mode: "direct" | "session" | "transaction" = "direct") {
  let client: SqlClient | undefined;
  let destroy = false;
  try {
    if (!["direct", "session", "transaction"].includes(mode)) throw new UsersFailure("dependency_unavailable");
    client = await pool.connect();
    // pg_stat_ssl ve pooler -> PostgreSQL; en session se verifica el socket
    // cliente -> pooler. Sin evidencia del driver, se deniega antes del SELECT.
    if (mode === "session") {
      if (!client.assertVerifiedTls) throw new UsersFailure("dependency_unavailable");
      client.assertVerifiedTls();
    }
    const result = await client.query(PREFLIGHT_SQL, [mode]);
    if (result.rows.length !== 1 || !isRecord(result.rows[0]) || result.rows[0].ok !== true ||
        !hasOnlyAuthorizedAccess(result.rows[0].access_paths)) {
      throw new UsersFailure("dependency_unavailable");
    }
  } catch {
    destroy = true;
    throw new UsersFailure("dependency_unavailable");
  } finally { client?.release(destroy); }
}
