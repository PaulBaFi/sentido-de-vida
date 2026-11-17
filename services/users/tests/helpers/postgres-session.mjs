/** Solo runner de pruebas: ninguna transacción se confirma. */
export async function rollback(client) {
  const result = await client.query("ROLLBACK");
  if (result?.command !== "ROLLBACK") throw new Error("ROLLBACK no confirmado.");
}

/** No propagar errores crudos, causes ni objetos del driver al runner. */
export async function runRollbackSession(pool, inspect, work) {
  const failures = [];
  let client;
  let result;
  let stage = "inspección";
  try {
    await inspect(pool);
    stage = "adquisición";
    client = await pool.connect();
    stage = "inicio de transacción";
    await client.query("BEGIN");
    stage = "verificación de la prueba";
    result = await work(client);
  } catch {
    failures.push(new Error(`Falló ${stage}; revisar sin exponer detalles privados.`));
  } finally {
    if (client) {
      try { await rollback(client); }
      catch { failures.push(new Error("Falló ROLLBACK o su confirmación.")); }
      // Aunque falle ROLLBACK, intentar descartar el cliente. Aunque falle
      // release, intentar cerrar el pool. Ningún fallo sustituye a los demás.
      try { await client.release(failures.length > 0); }
      catch { failures.push(new Error("Falló la liberación de la conexión.")); }
    }
    try { await pool.end(); }
    catch { failures.push(new Error("Falló el cierre del pool de conexiones.")); }
  }
  if (failures.length) {
    throw new AggregateError(failures, "Prueba PostgreSQL fallida; revisar las etapas indicadas.");
  }
  return result;
}
