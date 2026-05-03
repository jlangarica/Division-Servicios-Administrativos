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
  // --- Validación server-side (defensa en profundidad) ---
  if (!payload || !payload.fileData || !payload.formData) {
    return { success: false, error: 'Payload incompleto.' };
  }

  const { fileData, formData } = payload;

  if (!fileData.base64 || !fileData.mimeType || !fileData.fileName) {
    return { success: false, error: 'Datos de archivo incompletos.' };
  }

  // Validar que sea PDF (el cliente valida, pero el servidor debe verificar también)
  if (fileData.mimeType !== 'application/pdf') {
    return { success: false, error: 'Solo se aceptan archivos PDF.' };
  }

  // Validar tamaño máximo (10 MB en base64 ≈ ~13.3 MB en texto)
  if (fileData.base64.length > 14000000) {
    return { success: false, error: 'El archivo excede el tamaño máximo permitido (10 MB).' };
  }

  const requiredFields = ['tipo_tramite', 'fecha_recepcion', 'servicio_solicitante', 'oficio_solicitud'];
  for (const field of requiredFields) {
    if (!formData[field] || !formData[field].trim()) {
      return { success: false, error: `Campo requerido faltante: ${field}` };
    }
  }

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

    const lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      // 1. Solo leemos la columna de referencia (columna G = índice 7)
      const oficiosRange = sheet.getRange(2, 7, lastRow - 1, 1); 
      const oficios = oficiosRange.getValues().flat();

      const isDuplicate = oficios.includes(formData.oficio_solicitud);
      if (isDuplicate) {
        return { success: false, error: 'La referencia del oficio ya se encuentra registrada en el sistema.' };
      }
    }

    // Calcular folios (Correlativo numérico)
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
      expedienteFolder.getUrl(),                // URL Drive
      payload.formData.tiene_negativa,          // ¿Negativa?
      payload.formData.fecha_negativa           // Fecha Negativa
    ];
    
    // 2. Escritura optimizada (appendRow es lento en transacciones grandes)
    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
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

/**
 * Obtiene las solicitudes activas para la bandeja del usuario.
 * Filtra por rol o asignación según el motor de workflow.
 * 
 * @returns {Array<Object>} Lista de expedientes para el Kanban.
 */
/**
 * Obtiene todos los expedientes registrados para la vista de biblioteca histórica.
 * @returns {Array<Object>} Lista de expedientes enriquecida con el año.
 */
function getExpedientesLibrary() {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    const headers = values[0];
    const colUUID = 0;
    const colFolio = 2; 
    const colTipo = 3;
    const colFecha = 4;
    const colServicio = 5;
    const colEstado = headers.findIndex(h => h.toString().toLowerCase() === 'estado_actual' || h.toString().toLowerCase() === 'estatus');

    return values.slice(1).map(row => {
      const folio = String(row[colFolio]);
      const anioMatch = folio.match(/-(\d{4})-/);
      const anio = anioMatch ? anioMatch[1] : new Date().getFullYear().toString();

      return {
        uuid: row[colUUID],
        folio: folio,
        tipo: row[colTipo],
        fecha: row[colFecha],
        servicio: row[colServicio],
        estado: colEstado !== -1 ? row[colEstado] : 'S01_RECEPCION',
        anio: anio
      };
    }).reverse(); 

  } catch (error) {
    console.error('[ExpedienteService] Error en getExpedientesLibrary:', error);
    return [];
  }
}

function getSolicitudesPorUsuario() {
  try {
    const user = getActiveUserSession();
    if (!user) return [];

    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    const headers = values[0];
    const colUUID = 0;
    const colFolio = 2; // folioDsa
    const colServicio = 5; // servicio_solicitante
    const colAtiende = 7; // atiende
    
    const colEstado = headers.findIndex(h => 
      h.toString().toLowerCase() === 'estado_actual' || 
      h.toString().toLowerCase() === 'estatus'
    );

    // Mapeo de datos para el frontend
    const solicitudes = values.slice(1).map(row => ({
      uuid: row[colUUID],
      folio: row[colFolio],
      servicio: row[colServicio],
      estado: colEstado !== -1 ? row[colEstado] : 'S01_RECEPCION',
      atiende: row[colAtiende]
    }));

    // Filtro básico: DSA ve todo por ahora, otros ven lo asignado
    // (Ajustar según lógica de negocio real)
    if (user.role === 'DSA') {
      return solicitudes.filter(s => s.estado !== 'FINALIZADO' && s.estado !== 'S99_RECHAZADO');
    } else {
      return solicitudes.filter(s => s.atiende === user.email);
    }

  } catch (error) {
    console.error('[ExpedienteService] Error en getSolicitudesPorUsuario:', error);
    return [];
  }
}

/**
 * Obtiene el detalle completo de un folio para su gestión.
 * 
 * @param {string} uuid
 * @returns {Object} Detalle del folio.
 */
function getFolioDetails(uuid) {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    const values = sheet.getDataRange().getValues();
    
    const headers = values[0];
    const row = values.find(r => r[0] === uuid);
    if (!row) return null;

    const colEstado = headers.findIndex(h => h.toString().toLowerCase() === 'estado_actual' || h.toString().toLowerCase() === 'estatus');
    const colDrive = headers.findIndex(h => h.toString().toLowerCase().includes('drive') || h.toString().toLowerCase().includes('url'));

    const driveUrl = colDrive !== -1 ? row[colDrive] : row[8]; 
    
    // Obtener ID del archivo PDF de la carpeta
    let pdfFileId = '';
    
    try {
      const folderId = driveUrl.split('/folders/')[1].split('?')[0];
      const folder = DriveApp.getFolderById(folderId);
      const files = folder.getFilesByType(MimeType.PDF);
      
      if (files.hasNext()) {
        const file = files.next();
        pdfFileId = file.getId();
      }
    } catch (e) {
      console.warn('[GetFolioDetails] No se pudo obtener el PDF de Drive:', e);
    }

    return {
      uuid: row[0],
      folio: row[2],
      servicio: row[5],
      estado: colEstado !== -1 ? row[colEstado] : 'S01_RECEPCION',
      pdfFileId: pdfFileId,
      // Mapeo adicional para el formulario inicial
      data: {
        oficio_solicitud: row[6], // Referencia
        tipo_tramite: row[3]      // Tipo
      }
    };

  } catch (error) {
    console.error('[ExpedienteService] Error en getFolioDetails:', error);
    return null;
  }
}


