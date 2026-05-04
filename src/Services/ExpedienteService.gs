/**
 * Servicio para la gestion de expedientes y recepcion de oficios.
 */

/**
 * Registra el ingreso de un oficio, creando una entidad digital centralizada.
 * Utiliza LockService para garantizar la atomicidad del folio.
 *
 * NOTA: La firma fue cambiada de processIntake(fileId, formDataJson, ocrItemsJson) a
 * processIntake(payloadJson) para evitar el bug conocido de google.script.run que
 * pierde el PRIMER argumento cuando se encadenan .withSuccessHandler/.withFailureHandler
 * y se pasan multiples argumentos (especialmente strings grandes).
 *
 * El fileId viaja DENTRO del JSON payload, nunca como argumento separado.
 * Este es el mismo patron que ya funciona en processOcrEndpoint(fileId) con 1 solo argumento.
 *
 * @param {string} payloadJson - JSON string con estructura: {"fileId":"...","formData":{...},"ocrItems":[...]}
 * @returns {Object} Respuesta {success, folio, viewUrl, fileId, error}
 */
function processIntake(payloadJson) {
  // 0. Debug Log
  console.log('[processIntake] INICIO - payloadJson recibido (length):', payloadJson ? (typeof payloadJson === 'string' ? payloadJson.length : 'OBJECT') : 'NULL');
  
  var payload;

  // 1. Manejo resiliente del payload (Apps Script a veces auto-parsea JSON)
  if (typeof payloadJson === 'object' && payloadJson !== null) {
    console.log('[processIntake] El payload ya llegó como objeto. Saltando JSON.parse.');
    payload = payloadJson;
  } else if (typeof payloadJson === 'string' && payloadJson.trim() !== '') {
    try {
      payload = JSON.parse(payloadJson);
      console.log('[processIntake] Payload parseado exitosamente');
    } catch (e) {
      console.error('[processIntake] ERROR PARSEANDO JSON:', e.message);
      console.error('[processIntake] JSON recibido (recorte):', payloadJson.substring(0, 500));
      return { success: false, error: 'JSON inválido: ' + e.message };
    }
  } else {
    console.error('[processIntake] PAYLOAD VACÍO O INVÁLIDO');
    return { success: false, error: 'Payload vacío o inválido.' };
  }

  var fileId = payload.fileId;
  var formData = payload.formData;
  var ocrItems = payload.ocrItems || [];

  console.log('[processIntake] fileId extraído:', fileId);
  console.log('[processIntake] formData keys:', Object.keys(formData || {}));
  console.log('[processIntake] ocrItems count:', ocrItems.length);

  // 2. Validar fileId directamente
  if (!fileId || (typeof fileId !== 'string' && typeof fileId !== 'number') || String(fileId).trim() === '') {
    console.error('[processIntake] FILEID FALTANTE:', fileId);
    return {
      success: false,
      error: 'Falta el identificador del archivo PDF.'
    };
  }

  // Asegurar que fileId sea string
  fileId = String(fileId);

  // 3. Validar formData
  if (!formData || typeof formData !== 'object') {
    console.error('[processIntake] formData invalido - valor:', formData);
    return { success: false, error: 'Faltan los datos del formulario.' };
  }

// 4. Validar campos requeridos del formulario
  var requiredFields = ['tipo_tramite', 'fecha_recepcion', 'servicio_solicitante', 'oficio_solicitud'];
  for (var i = 0; i < requiredFields.length; i++) {
    var field = requiredFields[i];
    if (!formData[field] || !String(formData[field]).trim()) {
      return { success: false, error: 'El campo [' + field + '] es obligatorio.' };
    }
  }

  const lock = LockService.getScriptLock();
  try {
    // 5. Adquisición de Lock (Máximo 15s para procesos de Drive)
    lock.waitLock(15000);

    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS) || ss.getSheets()[0];
    const lastRow = sheet.getLastRow();
    const dataRange = lastRow > 1 ? sheet.getRange(2, 7, lastRow - 1, 1).getValues().flat() : [];

    // Verificación de duplicados por Referencia (Columna G - Oficio Solicitud)
    if (dataRange.includes(formData.oficio_solicitud.trim())) {
      return { success: false, error: 'Este número de oficio ya ha sido registrado previamente.' };
    }

    // 6. Generación de Folio y Metadatos
    const correlativo = lastRow === 0 ? 1 : lastRow;
    const anio = new Date().getFullYear();
    const idInterno = generateUUID();
    const idFolio = correlativo + '/' + anio;
    const folioDsa = 'DSA-' + anio + '-' + String(correlativo).padStart(3, '0');

    // Formateo de fecha ISO a Regional
    var fechaFormateada = formData.fecha_recepcion;
    var partes = formData.fecha_recepcion.split('-');
    if (partes.length === 3) {
      fechaFormateada = partes[2] + '/' + partes[1] + '/' + partes[0];
    }

    // 7. Operaciones en Google Drive — Mover archivo de buffer a carpeta expediente
    var rootFolder = DriveApp.getFolderById(DRIVE_CONFIG.EXPEDIENTES_FOLDER_ID);
    var expedienteFolder = rootFolder.createFolder('Folio_' + folioDsa + '_DSA');

    var sourceFile = DriveApp.getFileById(fileId);
    var fileName = sourceFile.getName();
    var blob = sourceFile.getBlob();
    blob.setName('Oficio_' + folioDsa + '_' + fileName);
    var file = expedienteFolder.createFile(blob);

    // Limpiar archivo temporal del buffer (si existe en carpeta buffer)
    try {
      sourceFile.setTrashed(true);
      console.log('[processIntake] Archivo buffer eliminado: %s', fileId);
    } catch (trashErr) {
      console.warn('[processIntake] No se pudo eliminar archivo buffer:', trashErr.message);
    }

    // 8. Persistencia Atómica en Sheet 'Expedientes'
    var timestamp = new Date();
    var sheetExp = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);

    if (!sheetExp) {
      throw new Error('No se encontró la hoja de destino (Expedientes o Base de Datos).');
    }

    var rowData = [
      idInterno,                            // 1. uuid_folio
      folioDsa,                             // 2. folio_dsa
      formData.tipo_tramite,                // 3. tipo_tramite
      fechaFormateada,                      // 4. fecha_recepcion
      formData.servicio_solicitante,        // 5. servicio_solicitante
      formData.oficio_solicitud.trim(),     // 6. oficio_solicitud
      formData.atiende,                     // 7. atiende (Creador)
      'S01_RECEPCION',                      // 8. estatus_actual (ESTADO INICIAL FSM)
      timestamp,                            // 9. fecha_estatus
      'DSA',                                // 10. asignado_a
      '',                                   // 11. locked_by
      expedienteFolder.getId()              // 12. drive_carpeta_id
    ];

    sheetExp.appendRow(rowData);

    // 9. Registrar Evento Génesis en Flujo
    var sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
    if (sheetFlujo) {
      var auditLog = [
        idInterno,               // uuid_folio
        timestamp,               // timestamp
        'INIT_PROCESS',          // evento
        'NONE',                  // estado_origen
        'S01_RECEPCION',         // estado_destino
        formData.atiende,        // actor
        'Recepción de documento físico' // payload/reason
      ];
      sheetFlujo.appendRow(auditLog);
    }

    SpreadsheetApp.flush();

    console.log('[processIntake] EXITO — Folio:', folioDsa, 'FileId:', file.getId());

    return {
      success: true,
      folio: folioDsa,
      viewUrl: file.getUrl(),
      fileId: file.getId()
    };

  } catch (error) {
    console.error('[ExpedienteService] processIntake Failure:', error);
    return { success: false, error: 'Error en el servidor: ' + error.message };
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
    var ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    var sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var headers = data[0].map(function(h) { return String(h).toLowerCase(); });
    var find = function(name) { return headers.findIndex(function(h) { return h.includes(name); }); };

    var idx = {
      uuid: find('uuid'),
      folio: find('folio_dsa') !== -1 ? find('folio_dsa') : find('folio'),
      tipo: find('tipo'),
      fecha: find('fecha_recepcion') !== -1 ? find('fecha_recepcion') : find('fecha'),
      servicio: find('servicio'),
      estado: find('estado') !== -1 ? find('estado') : find('estatus')
    };

    return data.slice(1).map(function(row) {
      var folio = idx.folio !== -1 ? String(row[idx.folio]) : 'N/A';
      var anioMatch = folio.match(/-(\d{4})-/);

      return {
        uuid: idx.uuid !== -1 ? row[idx.uuid] : '',
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
 * Obtiene solicitudes filtradas por usuario o rol con mapeo dinámico.
 */
function getSolicitudesPorUsuario() {
  try {
    var user = getActiveUserSession();
    if (!user) return [];

    var ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    var sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var headers = data[0].map(function(h) { return String(h).toLowerCase(); });
    var find = function(name) { return headers.findIndex(function(h) { return h.includes(name); }); };

    var colIdx = {
      uuid: find('uuid'),
      folio: find('folio_dsa') !== -1 ? find('folio_dsa') : find('folio'),
      servicio: find('servicio'),
      atiende: find('atiende'),
      estado: find('estado') !== -1 ? find('estado') : find('estatus')
    };

    var solicitudes = data.slice(1).map(function(row) {
      return {
        uuid: colIdx.uuid !== -1 ? row[colIdx.uuid] : '',
        folio: colIdx.folio !== -1 ? row[colIdx.folio] : 'N/A',
        servicio: colIdx.servicio !== -1 ? row[colIdx.servicio] : '',
        estado: colIdx.estado !== -1 ? row[colIdx.estado] : 'S01_RECEPCION',
        atiende: colIdx.atiende !== -1 ? row[colIdx.atiende] : ''
      };
    });

    if (user.role === 'DSA') {
      return solicitudes.filter(function(s) { return !['FINALIZADO', 'S99_RECHAZADO'].includes(s.estado); });
    }

    return solicitudes.filter(function(s) { return s.atiende === user.email; });

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
    var ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    var sheet = ss.getSheetByName(SHEETS.BASE_DATOS);
    var data = sheet.getDataRange().getValues();

    var headers = data[0].map(function(h) { return String(h).toLowerCase(); });
    var row = data.find(function(r) { return r[0] === uuid; });
    if (!row) return null;

    var colIdx = {
      estado: headers.findIndex(function(h) { return h.includes('estado') || h.includes('estatus'); }),
      url: headers.findIndex(function(h) { return h.includes('drive') || h.includes('url'); })
    };

    var driveUrl = colIdx.url !== -1 ? row[colIdx.url] : '';
    var pdfFileId = '';

    if (driveUrl) {
      try {
        var folderId = driveUrl.match(/[-\w]{25,}/);
        if (folderId) {
          var folder = DriveApp.getFolderById(folderId[0]);
          var files = folder.getFilesByType(MimeType.PDF);
          if (files.hasNext()) pdfFileId = files.next().getId();
        }
      } catch (e) {
        console.warn('[GetFolioDetails] I/O Drive Error para ' + uuid + ':', e.message);
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
