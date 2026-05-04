/**
 * Orquestador Transaccional (Repository Pattern)
 *
 * CORRECCIONES v2:
 *  - BUG-05 FIX: `ss.getSheetByName(SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS)` era
 *    un error lógico. SHEETS.EXPEDIENTES es un string truthy, por lo que el operador ||
 *    NUNCA evaluaba SHEETS.BASE_DATOS. Corregido a llamadas encadenadas.
 *  - BUG-07 FIX: `lock.releaseLock()` en el bloque finally no estaba en try-catch.
 *    Si waitLock lanzaba una excepción por timeout (10s), releaseLock() también lanzaba
 *    en el finally, ocultando el error original y evitando que el return del catch
 *    llegara al caller. Corregido con try-catch interno.
 */
const WorkflowRepository = {

  /**
   * Despacha un evento al sistema para un folio específico.
   *
   * @param {string} uuid_folio
   * @param {string} event
   * @param {Object} [payload={}]
   * @returns {Object} {success, error, newState}
   */
  dispatchEvent: function(uuid_folio, event, payload = {}) {
    const lock = LockService.getScriptLock();

    try {
      lock.waitLock(10000);

      // 2. Hidratación del contexto actual
      const context = ContextManager.buildContext(uuid_folio);

      // 3. Evaluación de Reglas de Negocio (FSM)
      const result = WorkflowEngine.evaluateTransition(
        context.estado_actual,
        event,
        context,
        payload
      );

      if (!result.ok) {
        return { success: false, error: result.error };
      }

      // 4. Persistencia Atómica (Side Effects)
      const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);

      // FIX BUG-05: El operador `||` entre strings no-vacíos siempre retorna el primero.
      // SHEETS.EXPEDIENTES = 'Expedientes' es truthy → SHEETS.BASE_DATOS NUNCA se evaluaba.
      // La corrección es encadenar dos llamadas a getSheetByName.
      const sheetExp   = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
      const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);

      // Actualizar Estado en Base de Datos
      if (sheetExp) {
        const headers  = sheetExp.getRange(1, 1, 1, sheetExp.getLastColumn()).getValues()[0]
                           .map(h => String(h).toLowerCase());
        const colEstado = headers.findIndex(h => h.includes('estado') || h.includes('estatus')) + 1;

        if (colEstado > 0) {
          sheetExp.getRange(context.rowIndex, colEstado).setValue(result.nextState);
        } else {
          throw new Error('No se encontró la columna de estado en la base de datos.');
        }
      } else {
        throw new Error('No se encontró la hoja de Expedientes ni Base de Datos.');
      }

      // Registrar Auditoría en Flujo
      if (sheetFlujo) {
        sheetFlujo.appendRow([
          uuid_folio,
          new Date(),
          event,
          context.estado_actual,
          result.nextState,
          payload.userEmail || Session.getActiveUser().getEmail() || 'Sistema',
          payload.reason || ''
        ]);
      }

      // Invalidación de Caché del contexto del folio
      const cache = CacheService.getScriptCache();
      cache.remove('ctx_v2_' + uuid_folio);
      cache.remove('dashboard_stats_v1'); // Invalidar dashboard también

      SpreadsheetApp.flush();

      return {
        success:  true,
        newState: result.nextState
      };

    } catch (e) {
      console.error('[WorkflowRepository] Error:', e);
      return { success: false, error: `Error transaccional: ${e.message}` };
    } finally {
      // FIX BUG-07: releaseLock() sin try-catch en un finally puede lanzar una
      // segunda excepción si waitLock() había fallado por timeout, lo que oculta
      // el error original del catch e impide que su return llegue al caller.
      try { lock.releaseLock(); } catch (_) {}
    }
  }
};
