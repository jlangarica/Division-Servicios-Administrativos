/**
 * Orquestador Transaccional (Repository Pattern)
 */
const WorkflowRepository = {

  /**
   * Despacha un evento al sistema para un folio específico, manejando la transacción completa.
   * 
   * @param {string} uuid_folio 
   * @param {string} event 
   * @param {Object} [payload={}] 
   * @returns {Object} Respuesta {success, error, newState}
   */
  dispatchEvent: function(uuid_folio, event, payload = {}) {
    const lock = LockService.getScriptLock();
    
    try {
      // 1. Adquisición de Lock
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
      const sheetExp = ss.getSheetByName(SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS);
      const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
      
      // Actualizar Estado en Base de Datos
      if (sheetExp) {
        const headers = sheetExp.getRange(1, 1, 1, sheetExp.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase());
        const colEstado = headers.findIndex(h => h.includes('estado') || h.includes('estatus')) + 1;
        
        if (colEstado > 0) {
          sheetExp.getRange(context.rowIndex, colEstado).setValue(result.nextState);
        } else {
          throw new Error('No se encontró la columna de estado en la base de datos.');
        }
      }

      // Registrar Auditoría en Flujo
      if (sheetFlujo) {
        const auditLog = [
          uuid_folio,
          new Date(),
          event,
          context.estado_actual,
          result.nextState,
          payload.userEmail || Session.getActiveUser().getEmail() || 'Sistema',
          payload.reason || ''
        ];
        sheetFlujo.appendRow(auditLog);
      }

      // 5. Invalidation de Caché
      const cache = CacheService.getScriptCache();
      cache.remove('ctx_v2_' + uuid_folio);
      // Opcional: Invalidar resúmenes del dashboard si es necesario
      
      SpreadsheetApp.flush();

      return { 
        success: true, 
        newState: result.nextState 
      };

    } catch (e) {
      console.error('[WorkflowRepository] Error:', e);
      return { success: false, error: `Error transaccional: ${e.message}` };
    } finally {
      lock.releaseLock();
    }
  }
};

