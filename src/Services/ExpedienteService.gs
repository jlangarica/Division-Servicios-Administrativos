/**
 * Servicio para la gestión de expedientes y recepción de oficios.
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
 * @property {boolean} tiene_negativa
 * @property {string} [fecha_negativa]
 *
 * @typedef {Object} IntakeDTO
 * @property {FileData} fileData
 * @property {FormData} formData
 */

/**
 * Registra el ingreso de un oficio, creando una entidad digital centralizada.
 * Utiliza LockService para garantizar la atomicidad del folio.
 *
 * @param {IntakeDTO} payload Datos desde el Frontend.
 * @returns {Object} Respuesta {success, folio, viewUrl, fileId, error}
 */
function processIntake(payload) {
  // 1. Validación exhaustiva
  if (!payload?.fileData?.base64 || !payload?.formData) {
    return { success: false, error: 'Información de registro incompleta.' };
  }

  const { fileData, formData } = payload;
  const requiredFields = ['tipo_tramite', 'fecha_recepcion', 'servicio_solicitante', 'oficio_solicitud'];
  
  for (const field of requiredFields) {
    if (!formData[field]?.trim()) {
      return { success: false, error: `El campo [${field}] es obligatorio.` };
    }
  }

  if (fileData.mimeType !== 'application/pdf') {
    return { success: false, error: 'Solo se permiten archivos en formato PDF.' };
  }

  const lock = LockService.getScriptLock();
  try {
    // 2. Adquisición de Lock (Máximo 15s para procesos de Drive)
    lock.waitLock(15000);
    
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS) || ss.getSheets()[0];
    const lastRow = sheet.getLastRow();
    const dataRange = lastRow > 1 ? sheet.getRange(2, 7, lastRow - 1, 1).getValues().flat() : [];

    // Verificación de duplicados por Referencia (Columna G - Oficio Solicitud)
    if (dataRange.includes(formData.oficio_solicitud.trim())) {
      return { success: false, error: 'Este número de oficio ya ha sido registrado previamente.' };
    }

    // 3. Generación de Folio y Metadatos
    const correlativo = lastRow === 0 ? 1 : lastRow; // 1-based index excluyendo header
    const anio = new Date().getFullYear();
    const idInterno = generateUUID();
    const idFolio = `${correlativo}/${anio}`;
    const folioDsa = `DSA-${anio}-${String(correlativo).padStart(3, '0')}`;

    // Formateo de fecha ISO a Regional
    const [y, m, d] = formData.fecha_recepcion.split('-');
    const fechaFormateada = (y && m && d) ? `${d}/${m}/${y}` : formData.fecha_recepcion;

    // 4. Operaciones en Google Drive
    const rootFolder = DriveApp.getFolderById(DRIVE_CONFIG.EXPEDIENTES_FOLDER_ID);
    const expedienteFolder = rootFolder.createFolder(`Folio_${folioDsa}_DSA`);
    
    const decodedFile = Utilities.base64Decode(fileData.base64);
    const blob = Utilities.newBlob(decodedFile, fileData.mimeType, `Oficio_${folioDsa}_${fileData.fileName}`);
    const file = expedienteFolder.createFile(blob);
    
    // 5. Persistencia en Sheet
    const rowData = [
      idInterno,                                // A: UUID
      idFolio,                                  // B: ID Folio
      folioDsa,                                 // C: Folio DSA
      formData.tipo_tramite,                    // D: Tipo
      fechaFormateada,                          // E: Fecha Recepción
      formData.servicio_solicitante,            // F: Servicio
      formData.oficio_solicitud.trim(),         // G: Referencia
      formData.atiende,                         // H: Responsable
      expedienteFolder.getUrl(),                // I: URL Drive
      formData.tiene_negativa || false,         // J: ¿Negativa?
      formData.fecha_negativa || ''             // K: Fecha Negativa
    ];
    
    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);
    SpreadsheetApp.flush(); 
    
    return {
      success: true,
      folio: folioDsa,
      viewUrl: file.getUrl(),
      fileId: file.getId()
    };
    
  } catch (error) {
    console.error('[ExpedienteService] processIntake Failure:', error);
    return { success: false, error: `Error en el servidor: ${error.message}` };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Obtiene la biblioteca de expedientes con mapeo dinámico de columnas.
 * @returns {Array<Object>}
 */
function getExpedientesLibrary() {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0].map(h => String(h).toLowerCase());
    const idx = {
      uuid: headers.indexOf('uuid'),
      folio: headers.indexOf('folio_dsa'),
      tipo: headers.indexOf('tipo_tramite'),
      fecha: headers.indexOf('fecha_recepcion'),
      servicio: headers.indexOf('servicio_solicitante'),
      estado: headers.findIndex(h => h.includes('estado') || h.includes('estatus'))
    };

    // Fallbacks si las cabeceras no coinciden exactamente
    if (idx.uuid === -1) idx.uuid = 0;
    if (idx.folio === -1) idx.folio = 2;

    return data.slice(1).map(row => {
      const folio = String(row[idx.folio]);
      const anioMatch = folio.match(/-(\d{4})-/);
      
      return {
        uuid: row[idx.uuid],
        folio: folio,
        tipo: idx.tipo !== -1 ? row[idx.tipo] : 'N/A',
        fecha: idx.fecha !== -1 ? row[idx.fecha] : '',
        servicio: idx.servicio !== -1 ? row[idx.servicio] : '',
        estado: idx.estado !== -1 ? row[idx.estado] : 'S01_RECEPCION',
        anio: anioMatch ? anioMatch[1] : new Date().getFullYear().toString()
      };
    }).reverse();

  } catch (error) {
    console.error('[ExpedienteService] getExpedientesLibrary Error:', error);
    return [];
  }
}

/**
 * Obtiene solicitudes filtradas por usuario o rol.
 */
function getSolicitudesPorUsuario() {
  try {
    const user = getActiveUserSession();
    if (!user) return [];

    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0].map(h => String(h).toLowerCase());
    const colIdx = {
      uuid: 0,
      folio: 2,
      servicio: 5,
      atiende: 7,
      estado: headers.findIndex(h => h.includes('estado') || h.includes('estatus'))
    };

    const solicitudes = data.slice(1).map(row => ({
      uuid: row[colIdx.uuid],
      folio: row[colIdx.folio],
      servicio: row[colIdx.servicio],
      estado: colIdx.estado !== -1 ? row[colIdx.estado] : 'S01_RECEPCION',
      atiende: row[colIdx.atiende]
    }));

    // Lógica de visibilidad: DSA ve todo lo pendiente, otros ven lo asignado
    if (user.role === 'DSA') {
      return solicitudes.filter(s => !['FINALIZADO', 'S99_RECHAZADO'].includes(s.estado));
    }
    
    return solicitudes.filter(s => s.atiende === user.email);

  } catch (error) {
    console.error('[ExpedienteService] getSolicitudesPorUsuario Error:', error);
    return [];
  }
}

/**
 * Obtiene detalle de un folio buscando eficientemente el archivo en Drive.
 */
function getFolioDetails(uuid) {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    const data = sheet.getDataRange().getValues();
    
    const headers = data[0].map(h => String(h).toLowerCase());
    const row = data.find(r => r[0] === uuid);
    if (!row) return null;

    const colIdx = {
      estado: headers.findIndex(h => h.includes('estado') || h.includes('estatus')),
      url: headers.findIndex(h => h.includes('drive') || h.includes('url'))
    };

    const driveUrl = colIdx.url !== -1 ? row[colIdx.url] : '';
    let pdfFileId = '';
    
    if (driveUrl) {
      try {
        const folderId = driveUrl.match(/[-\w]{25,}/); // Regex robusto para IDs de Drive
        if (folderId) {
          const folder = DriveApp.getFolderById(folderId[0]);
          const files = folder.getFilesByType(MimeType.PDF);
          if (files.hasNext()) pdfFileId = files.next().getId();
        }
      } catch (e) {
        console.warn(`[GetFolioDetails] I/O Drive Error para ${uuid}:`, e.message);
      }
    }

    return {
      uuid: row[0],
      folio: row[2],
      servicio: row[5],
      estado: colIdx.estado !== -1 ? row[colIdx.estado] : 'S01_RECEPCION',
      pdfFileId: pdfFileId,
      data: {
        oficio_solicitud: row[6],
        tipo_tramite: row[3]
      }
    };

  } catch (error) {
    console.error('[ExpedienteService] getFolioDetails Error:', error);
    return null;
  }
}



