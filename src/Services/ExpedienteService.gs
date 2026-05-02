/**
 * Servicio para la gestión de expedientes y recepción de oficios.
 *
 * @fileoverview Lógica transaccional para la División de Servicios Administrativos (DSA).
 * Conecta la UI con Google Drive y Google Sheets.
 */

/**
 * @typedef {Object} FileData
 * @property {string} base64
 * @property {string} fileName
 * @property {string} mimeType
 *
 * @typedef {Object} FormData
 * @property {string} tipo_tramite
 * @property {string} fecha_recepcion
 * @property {string} servicio_solicitante
 * @property {string} oficio_solicitud
 * @property {string} atiende
 *
 * @typedef {Object} IntakeDTO
 * @property {FileData} fileData
 * @property {FormData} formData
 */

/**
 * Registra el ingreso de un oficio, creando una entidad digital centralizada.
 * Utiliza LockService para concurrencia.
 *
 * @param {IntakeDTO} payload Datos desde el Frontend.
 * @returns {Object} Respuesta {success, folio, viewUrl, fileId, error}
 */
function processIntake(payload) {
  const lock = LockService.getScriptLock();
  try {
    // 1. Asignación de Folio (Bloqueo de concurrencia)
    // Espera hasta 10 segundos para adquirir el lock
    lock.waitLock(10000);
    
    // Obtener hoja de base de datos
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    let sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) {
        // Fallback a la primera hoja si no existe por nombre
        sheet = ss.getSheets()[0];
    }

    // Validación de Negocio: Duplicidad de oficio
    const data = sheet.getDataRange().getValues();
    const isDuplicate = data.some(row => row.includes(payload.formData.oficio_solicitud));
    if (isDuplicate) {
      return { success: false, error: 'La referencia del oficio de solicitud ya se encuentra registrada en el sistema.' };
    }

    // Calcular folios (Correlativo numérico)
    const lastRow = sheet.getLastRow();
    // Descontamos la cabecera
    const correlativo = lastRow === 0 ? 1 : lastRow; 
    const anio = new Date().getFullYear();
    
    const idInterno = generateUUID();
    const idFolio = `${correlativo}/${anio}`;
    const folioDsa = `DSA-${anio}-${String(correlativo).padStart(3, '0')}`;

    // Formato de Fecha: YYYY-MM-DD -> DD/MM/YYYY
    const partesFecha = payload.formData.fecha_recepcion.split('-');
    let fechaFormateada = payload.formData.fecha_recepcion;
    if (partesFecha.length === 3) {
      fechaFormateada = `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}`;
    }

    // 2. Estructura en Drive
    const rootFolder = DriveApp.getFolderById(DRIVE_CONFIG.EXPEDIENTES_FOLDER_ID);
    const expedienteFolder = rootFolder.createFolder(`Folio_${folioDsa}_DSA`);
    
    // 3. Persistencia del Archivo Oficio
    const decodedFile = Utilities.base64Decode(payload.fileData.base64);
    const blob = Utilities.newBlob(decodedFile, payload.fileData.mimeType, `Oficio_${folioDsa}_${payload.fileData.fileName}`);
    const file = expedienteFolder.createFile(blob);
    
    // 4. Registro en Base de Datos (Sheets)
    // Orden de columnas en el Segmento [1] de Ingreso:
    const rowData = [
      idInterno,                                // UUID
      idFolio,                                  // 1/2026
      folioDsa,                                 // DSA-2026-001
      payload.formData.tipo_tramite,            // COMPRA POR FONDO
      fechaFormateada,                          // DD/MM/YYYY
      payload.formData.servicio_solicitante,    // Unidad
      payload.formData.oficio_solicitud,        // Referencia
      payload.formData.atiende,                 // Correo sesión
      expedienteFolder.getUrl()                 // URL Drive
    ];
    
    sheet.appendRow(rowData);
    SpreadsheetApp.flush(); // Forzar la escritura
    
    return {
      success: true,
      folio: folioDsa,
      viewUrl: file.getUrl(),
      fileId: file.getId()
    };
    
  } catch (error) {
    console.error('[ExpedienteService] Error en processIntake:', error);
    return { success: false, error: error.message };
  } finally {
    // Liberar siempre el lock
    lock.releaseLock();
  }
}
