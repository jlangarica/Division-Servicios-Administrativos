/**
 * Gestor de Contexto Híbrido (Caché + Event Sourcing)
 * 
 * Se encarga de reconstruir el estado actual (Snapshot) y de hidratar
 * variables adicionales desde el historial de eventos.
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
    const cacheKey = 'ctx_v2_' + uuid_folio;
    
    // 1. Caché L1 (Individual Folio Context)
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (e) {
        console.warn(`[ContextManager] Caché corrupto para ${uuid_folio}.`);
      }
    }

    // 2. Snapshot (Estado Actual)
    const context = this._hydrateSnapshot(uuid_folio);
    if (!context) {
      throw new Error(`Folio [${uuid_folio}] no encontrado en la base de datos.`);
    }

    // 3. Event Sourcing Parcial
    this._hydrateFromEvents(context);

    // 4. Guardar Caché (TTL 5 min)
    cache.put(cacheKey, JSON.stringify(context), 300);

    return context;
  },

  /**
   * Lee la fila correspondiente en la hoja de Expedientes de forma eficiente.
   * 
   * @param {string} uuid_folio
   * @returns {Object|null} Snapshot base
   * @private
   */
  _hydrateSnapshot: function(uuid_folio) {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheetName = SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS; 
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return null;
    
    // Optimizamos: Solo leemos la columna UUID para encontrar la fila
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const uuids = sheet.getRange(1, 1, lastRow, 1).getValues().flat();
    const rowIndex = uuids.indexOf(uuid_folio);
    
    if (rowIndex === -1) return null;

    // Leemos solo la fila necesaria
    const rowData = sheet.getRange(rowIndex + 1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = uuids[0] === 'uuid' ? uuids : sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).toLowerCase());
    
    const findCol = (name) => {
      const idx = headers.findIndex(h => String(h).toLowerCase().includes(name));
      return idx !== -1 ? rowData[idx] : null;
    };

    return {
      uuid_folio: uuid_folio,
      rowIndex: rowIndex + 1,
      estado_actual: findCol('estado') || findCol('estatus') || 'S01_RECEPCION',
      servicio_solicitante: rowData[5], // Fallback a columna 6
      documents: ['OFICIO_ESCANEADO'], // TODO: Hidratar desde Drive si es necesario
      cotizacionesRecibidas: 0 
    };
  },

  /**
   * Lee los eventos recientes de la hoja Flujo si la transición lo requiere.
   * 
   * @param {Object} context 
   * @private
   */
  _hydrateFromEvents: function(context) {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.FLUJO);
    if (!sheet) return;

    // Solo hidratamos si es relevante para el estado actual
    if (context.estado_actual === 'S08_PROVEEDOR_COTIZA') {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      // Lectura optimizada: Últimas 100 filas suelen bastar para eventos recientes
      const startRow = Math.max(2, lastRow - 100);
      const values = sheet.getRange(startRow, 1, (lastRow - startRow) + 1, 3).getValues(); 
      
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
