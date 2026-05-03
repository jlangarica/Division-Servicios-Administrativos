/**
 * Orquestador Transaccional (Repository Pattern)
 * 
 * Maneja el ciclo de vida efímero de las peticiones en GAS,
 * la sincronización concurrente, y la limpieza de caché tras efectos secundarios.
 */
const WorkflowRepository = {

  /**
   * Despacha un evento al sistema para un folio específico, manejando la transacción completa.
   * 
   * @param {string} uuid_folio 
   * @param {string} event 
   * @param {Object} [payload={}] Datos adicionales como justificación de rechazo, usuario, etc.
   * @returns {Object} Respuesta {success: boolean, error?: string, newState?: string}
   */
  dispatchEvent: function(uuid_folio, event, payload = {}) {
    const lock = LockService.getScriptLock();
    
    try {
      // 1. Adquisición de Lock (Concurrencia Segura)
      lock.waitLock(10000); // Esperar hasta 10 segundos

      // 2. Hidratación
      const context = ContextManager.buildContext(uuid_folio);

      // 3. Evaluación Pura (Motor FSM)
      const result = WorkflowEngine.evaluateTransition(
        context.estado_actual, 
        event, 
        context, 
        payload
      );

      if (!result.ok) {
        return { success: false, error: result.error };
      }

      // 4. Mutación Atómica - Side Effects
      const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
      const sheetExpedientes = ss.getSheetByName(SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS);
      const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
      
      // Actualizar Base de Datos (Expedientes)
      if (sheetExpedientes) {
        // En lugar de buscar headers cada vez, podríamos tenerlo en configuración o caché
        const lastCol = sheetExpedientes.getLastColumn();
        const headers = sheetExpedientes.getRange(1, 1, 1, lastCol).getValues()[0];
        let colEstadoActual = headers.findIndex(h => h.toString().toLowerCase() === 'estado_actual' || h.toString().toLowerCase() === 'estatus') + 1;
        
        if (colEstadoActual > 0) {
          sheetExpedientes.getRange(context.rowIndex, colEstadoActual).setValue(result.nextState);
        }
      }

      // Registrar en Historial (Flujo)
      if (sheetFlujo) {
        const timestamp = new Date();
        const user = payload.userEmail || Session.getActiveUser().getEmail() || 'Desconocido';
        const logRow1D = [
          uuid_folio,
          timestamp,
          event,
          context.estado_actual,
          result.nextState,
          user,
          payload.reason || ''
        ];
        sheetFlujo.appendRow(logRow1D);
      }

      // 5. Invalidación de Caché (¡Crítico!)
      const cache = CacheService.getScriptCache();
      cache.remove('ctx_' + uuid_folio);
      cache.remove('db_snapshot_values'); // Invalidar el caché de la hoja base

      // 6. Liberación y volcado a disco
      SpreadsheetApp.flush();

      return { 
        success: true, 
        newState: result.nextState 
      };

    } catch (e) {
      console.error('[WorkflowRepository] Error procesando evento:', e);
      return { success: false, error: e.message || 'Error transaccional interno.' };
    } finally {
      // 6. Liberación de Lock siempre en el bloque finally
      lock.releaseLock();
    }
  }
};
