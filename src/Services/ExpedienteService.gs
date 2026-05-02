/**
 * Servicio para la gestión de expedientes y recepción de oficios.
 *
 * @fileoverview Lógica transaccional para la División de Servicios Administrativos (DSA).
 * Conecta la UI con Google Drive y Google Sheets.
 */

/**
 * @typedef {Object} RequestDTO
 * @property {string} tipoTramite
 * @property {string} fechaRecepcion
 * @property {string} servicioSolicitante
 * @property {string} descripcion
 * @property {string} archivoBase64
 * @property {string} archivoMimeType
 * @property {string} archivoNombre
 */

/**
 * Registra el ingreso de un oficio, creando una entidad digital centralizada.
 * Utiliza LockService para concurrencia.
 *
 * @param {RequestDTO} payload Datos desde el Frontend.
 * @returns {Object} Respuesta {success, folio, folderUrl, error}
 */
function registrarIngresoOficio(payload) {
  const lock = LockService.getScriptLock();
  try {
    // 1. Asignación de Folio (Bloqueo de concurrencia)
    // Espera hasta 10 segundos para adquirir el lock
    lock.waitLock(10000);
    
    // Obtener hoja de adquisiciones
    const ssAdq = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    let sheet = ssAdq.getSheetByName(SHEETS.ADQUISICIONES);
    if (!sheet) {
        // Fallback a la primera hoja si no existe por nombre
        sheet = ssAdq.getSheets()[0];
    }

    // Calcular folios (Correlativo numérico)
    const lastRow = sheet.getLastRow();
    // Descontamos la cabecera (asumimos 1 fila de cabecera).
    // Si lastRow es 1 (solo cabecera), correlativo es 1.
    const correlativo = lastRow === 0 ? 1 : lastRow; 
    const anio = new Date().getFullYear();
    
    const idInterno = generateUUID();
    const idFolio = `${correlativo}/${anio}`;
    const folioDsa = `DSA-${anio}-${String(correlativo).padStart(3, '0')}`;

    // 2. Estructura en Drive
    const rootFolder = DriveApp.getFolderById(DRIVE_CONFIG.EXPEDIENTES_FOLDER_ID);
    const expedienteFolder = rootFolder.createFolder(`Folio_${folioDsa}_DSA`);
    
    // 3. Persistencia del Archivo Oficio
    const decodedFile = Utilities.base64Decode(payload.archivoBase64);
    const blob = Utilities.newBlob(decodedFile, payload.archivoMimeType, `Oficio_Solicitud_${folioDsa}.pdf`);
    const file = expedienteFolder.createFile(blob);
    
    // 4. Registro en Base de Datos (Sheets)
    // Orden de columnas en el Segmento [1] de Ingreso:
    // [ID_UUID, id_folio, folio_dsa, tipo_tramite, fecha_recepcion, servicio_solicitante, oficio_solicitud (URL)]
    const rowData = [
      idInterno,               // UUID
      idFolio,                 // 1/2026
      folioDsa,                // DSA-2026-001
      payload.tipoTramite,     // COMPRA POR FONDO
      payload.fechaRecepcion,  // Fecha
      payload.servicioSolicitante, 
      expedienteFolder.getUrl(), // URL Drive
      payload.descripcion      // Descripcion
    ];
    
    sheet.appendRow(rowData);
    SpreadsheetApp.flush(); // Forzar la escritura
    
    return {
      success: true,
      folio: folioDsa,
      folderUrl: expedienteFolder.getUrl()
    };
    
  } catch (error) {
    console.error('[ExpedienteService] Error en registrarIngresoOficio:', error);
    return { success: false, error: error.message };
  } finally {
    // Liberar siempre el lock
    lock.releaseLock();
  }
}
