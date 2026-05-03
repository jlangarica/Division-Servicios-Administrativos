/**
 * Gestor de Contexto Híbrido (Caché + Event Sourcing)
 * 
 * Se encarga de reconstruir el estado actual (Snapshot) y de hidratar
 * variables adicionales desde el historial de eventos cuando es necesario,
 * implementando una capa de caché (L1) para minimizar latencia de I/O a Sheets.
 */
const ContextManager = {

  /**
   * Construye o recupera el contexto de transición para un folio específico.
   * 
   * @param {string} uuid_folio Identificador único interno del folio.
   * @returns {Object} TransitionContext
   */
  buildContext: function(uuid_folio) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'ctx_' + uuid_folio;
    
    // 1. Caché L1
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (e) {
        console.warn(`[ContextManager] Caché corrupto para ${uuid_folio}, procediendo a re-hidratar.`);
      }
    }

    // 2. Snapshot (Estado Actual)
    const context = this._hydrateSnapshot(uuid_folio);
    if (!context) {
      throw new Error(`Folio [${uuid_folio}] no encontrado en la base de datos.`);
    }

    // 3. Event Sourcing Parcial
    this._hydrateFromEvents(context);

    // 4. Guardar Caché (TTL 300 segundos = 5 minutos)
    cache.put(cacheKey, JSON.stringify(context), 300);

    return context;
  },

  /**
   * Lee la fila correspondiente en la hoja de Expedientes.
   * Operación de I/O en bloque.
   * 
   * @param {string} uuid_folio
   * @returns {Object|null} Snapshot base
   * @private
   */
  _hydrateSnapshot: function(uuid_folio) {
    const cache = CacheService.getScriptCache();
    const dbCacheKey = 'db_snapshot_values';
    let values;
    
    // 1. Intentar obtener datos de la hoja desde caché
    const cachedValues = cache.get(dbCacheKey);
    if (cachedValues) {
      values = JSON.parse(cachedValues);
    } else {
      const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
      const sheetName = SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS; 
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return null;
      
      values = sheet.getDataRange().getValues();
      // Cacheamos los valores crudos por 60 segundos para evitar I/O masivo en ráfagas
      try {
        const serialized = JSON.stringify(values);
        if (serialized.length < 100000) {
          cache.put(dbCacheKey, serialized, 60);
        }
      } catch (e) {
        console.warn('[ContextManager] No se pudo cachear la base de datos (excede límite)');
      }
    }

    if (!values || values.length < 1) return null;
    const headers = values[0];
    const colUUID = 0; 
    let colEstadoActual = headers.findIndex(h => h.toString().toLowerCase() === 'estado_actual' || h.toString().toLowerCase() === 'estatus');
    
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][colUUID] === uuid_folio) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) return null;

    const row = values[rowIndex];
    
    return {
      uuid_folio: uuid_folio,
      rowIndex: rowIndex + 1,
      estado_actual: colEstadoActual !== -1 ? row[colEstadoActual] : 'S01_RECEPCION',
      servicio_solicitante: row[5],
      documents: ['OFICIO_ESCANEADO'],
      cotizacionesRecibidas: 0 
    };
  },

  /**
   * Lee los eventos recientes de la hoja Flujo si la transición lo requiere.
   * Modifica el contexto pasado por referencia.
   * 
   * @param {Object} context 
   * @private
   */
  _hydrateFromEvents: function(context) {
    if (!SHEETS.FLUJO) return; // Si no hay hoja de flujo, omitir
    
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.FLUJO);
    
    if (!sheet) return;

    // Solo hidratamos si es relevante para el estado actual
    // Ejemplo: Si estamos en PROVEEDOR_COTIZA, contar cotizaciones
    if (context.estado_actual === 'S08_PROVEEDOR_COTIZA') {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      // Lectura rápida de UUIDs y eventos
      const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); 
      // Supongamos [UUID, Fecha, Evento]
      let cotizaciones = 0;
      for (const row of values) {
        if (row[0] === context.uuid_folio && row[2] === 'RECEIVE_QUOTE') {
          cotizaciones++;
        }
      }
      context.cotizacionesRecibidas = cotizaciones;
    }
  }
};
