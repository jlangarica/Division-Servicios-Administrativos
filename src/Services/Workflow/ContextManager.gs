/**
 * Gestor de Contexto Híbrido (Caché + Event Sourcing)
 *
 * CORRECCIONES v2:
 *  - BUG-05 FIX: `SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS` era un error lógico.
 *    Como SHEETS.EXPEDIENTES es un string truthy, el || nunca evaluaba el fallback.
 *    Corregido a `getSheetByName(SHEETS.EXPEDIENTES) || getSheetByName(SHEETS.BASE_DATOS)`.
 *  - BUG-08 FIX: `servicio_solicitante: rowData[5]` era un índice hardcodeado.
 *    Si el schema del Spreadsheet cambia (columna insertada o renombrada), este
 *    índice apunta silenciosamente a la columna equivocada. Corregido usando findCol()
 *    (que ya estaba definido en la misma función) con rowData[5] como fallback.
 */
const ContextManager = {

  /**
   * Construye o recupera el contexto de transición para un folio específico.
   *
   * @param {string} uuid_folio Identificador único interno del folio.
   * @returns {Object} TransitionContext
   */
  buildContext: function(uuid_folio) {
    const cache    = CacheService.getScriptCache();
    const cacheKey = 'ctx_v2_' + uuid_folio;

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (e) {
        console.warn(`[ContextManager] Caché corrupto para ${uuid_folio}.`);
      }
    }

    const context = this._hydrateSnapshot(uuid_folio);
    if (!context) {
      throw new Error(`Folio [${uuid_folio}] no encontrado en la base de datos.`);
    }

    this._hydrateFromEvents(context);

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

    // FIX BUG-05: SHEETS.EXPEDIENTES = 'Expedientes' es un string truthy.
    // `SHEETS.EXPEDIENTES || SHEETS.BASE_DATOS` siempre evaluaba a 'Expedientes',
    // nunca intentando la hoja 'Base de Datos' como fallback real.
    const sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return null;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    // Leer solo la columna UUID para localizar la fila (eficiente)
    const uuids    = sheet.getRange(1, 1, lastRow, 1).getValues().flat();
    const rowIndex = uuids.indexOf(uuid_folio);
    if (rowIndex === -1) return null;

    // Leer la fila completa y los headers para mapeo dinámico
    const rowData = sheet.getRange(rowIndex + 1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                      .map(h => String(h).toLowerCase());

    const findCol = (name) => {
      const idx = headers.findIndex(h => h.includes(name));
      return idx !== -1 ? rowData[idx] : null;
    };

    return {
      uuid_folio:            uuid_folio,
      rowIndex:              rowIndex + 1, // 1-indexed para getRange() de Sheets
      estado_actual:         findCol('estado') || findCol('estatus') || 'S01_RECEPCION',
      // FIX BUG-08: Usar findCol() para buscar dinámicamente por nombre de columna.
      // rowData[5] era un índice hardcodeado frágil ante cambios de schema.
      // Se mantiene como fallback para compatibilidad con hojas sin cabecera 'servicio'.
      servicio_solicitante:  findCol('servicio') || rowData[5] || '',
      documents:             ['OFICIO_ESCANEADO'],
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
    const ss    = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.FLUJO);
    if (!sheet) return;

    if (context.estado_actual === 'S08_PROVEEDOR_COTIZA') {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const startRow = Math.max(2, lastRow - 100);
      const values   = sheet.getRange(startRow, 1, (lastRow - startRow) + 1, 3).getValues();

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
