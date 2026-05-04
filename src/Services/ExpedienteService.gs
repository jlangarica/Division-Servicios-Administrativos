/**
 * Servicio para la gestion de expedientes y recepcion de oficios.
 */

/**
 * Registra el ingreso de un oficio, creando una entidad digital centralizada.
 * Utiliza LockService para garantizar la atomicidad del folio.
 *
 * @param {Object} payload - Objeto con estructura: {fileId:"...", formData:{...}, ocrItems:[...]}
 * @returns {Object} Respuesta {success, folio, viewUrl, fileId, error}
 */
function processIntake(payload) {
  // 0. Debug Log — Ver exactamente qué llega desde el navegador
  console.log('[processIntake] INICIO — Procesando payload');
  console.log('[processIntake] Tipo de dato recibido:', typeof payload);
  
  // 1. Validación inicial del payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.error('[processIntake] ERROR: Payload no es un objeto válido');
    return { success: false, error: 'Payload vacío o inválido.' };
  }

  console.log('[processIntake] Payload llegó como OBJETO (google.script.run auto-deserializó)');

  // 2. Extraer y validar datos
  const fileId = payload.fileId;
  const formData = payload.formData;
  const ocrItems = Array.isArray(payload.ocrItems) ? payload.ocrItems : [];

  console.log('[processIntake] fileId extraído:', fileId);
  console.log('[processIntake] ocrItems count:', ocrItems.length);

  // 3. Validar fileId
  if (!fileId || String(fileId).trim() === '') {
    console.error('[processIntake] FILEID FALTANTE');
    return { success: false, error: 'Falta el identificador del archivo PDF.' };
  }

  const cleanFileId = String(fileId);

  // 4. Validar formData
  if (!formData || typeof formData !== 'object') {
    console.error('[processIntake] formData invalido');
    return { success: false, error: 'Faltan los datos del formulario.' };
  }

  // 5. Validar campos requeridos
  const requiredFields = ['tipo_tramite', 'fecha_recepcion', 'servicio_solicitante', 'oficio_solicitud'];
  for (const field of requiredFields) {
    if (!formData[field] || !String(formData[field]).trim()) {
      console.error('[processIntake] Campo requerido faltante:', field);
      return { success: false, error: `El campo [${field}] es obligatorio.` };
    }
  }

  const lock = LockService.getScriptLock();
  try {
    // 5. Adquisición de Lock (Máximo 15s)
    lock.waitLock(15000);

    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.BASE_DATOS) || ss.getSheets()[0];
    const lastRow = sheet.getLastRow();

    // Verificación de duplicados por Referencia (Columna G - Oficio Solicitud)
    const dataRange = lastRow > 1 ? sheet.getRange(2, 7, lastRow - 1, 1).getValues().flat() : [];
    if (dataRange.includes(formData.oficio_solicitud.trim())) {
      return { success: false, error: 'Este número de oficio ya ha sido registrado previamente.' };
    }

    // 6. Generación de Folio y Metadatos
    const correlativo = Math.max(1, lastRow);
    const anio = new Date().getFullYear();
    const idInterno = generateUUID();
    const folioDsa = `DSA-${anio}-${String(correlativo).padStart(3, '0')}`;

    // Formateo de fecha ISO a Regional (DD/MM/YYYY)
    let fechaFormateada = formData.fecha_recepcion;
    const partes = formData.fecha_recepcion.split('-');
    if (partes.length === 3) {
      fechaFormateada = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    // 7. Operaciones en Google Drive
    const rootFolder = DriveApp.getFolderById(DRIVE_CONFIG.EXPEDIENTES_FOLDER_ID);
    const expedienteFolder = rootFolder.createFolder(`Folio_${folioDsa}_DSA`);

    const sourceFile = DriveApp.getFileById(cleanFileId);
    const fileName = sourceFile.getName();
    const blob = sourceFile.getBlob();
    blob.setName(`Oficio_${folioDsa}_${fileName}`);
    const file = expedienteFolder.createFile(blob);

    // Limpiar archivo temporal
    try {
      sourceFile.setTrashed(true);
      console.log('[processIntake] Archivo buffer eliminado: %s', cleanFileId);
    } catch (trashErr) {
      console.warn('[processIntake] No se pudo eliminar archivo buffer:', trashErr.message);
    }

    // 8. Persistencia en Sheet 'Expedientes'
    const timestamp = new Date();
    const sheetExp = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);

    if (!sheetExp) {
      throw new Error('No se encontró la hoja de destino.');
    }

    const rowData = [
      idInterno,                            // 1. uuid_folio
      folioDsa,                             // 2. folio_dsa
      formData.tipo_tramite,                // 3. tipo_tramite
      fechaFormateada,                      // 4. fecha_recepcion
      formData.servicio_solicitante,        // 5. servicio_solicitante
      formData.oficio_solicitud.trim(),     // 6. oficio_solicitud
      formData.atiende,                     // 7. atiende
      'S01_RECEPCION',                      // 8. estatus_actual
      timestamp,                            // 9. fecha_estatus
      'DSA',                                // 10. asignado_a
      '',                                   // 11. locked_by
      expedienteFolder.getId()              // 12. drive_carpeta_id
    ];

    sheetExp.appendRow(rowData);

    // 9. Registrar Evento en Flujo
    const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
    if (sheetFlujo) {
      const auditLog = [
        idInterno,
        timestamp,
        'INIT_PROCESS',
        'NONE',
        'S01_RECEPCION',
        formData.atiende,
        `Recepción de documento físico. OCR items: ${ocrItems.length}`
      ];
      sheetFlujo.appendRow(auditLog);
    }

    SpreadsheetApp.flush();

    console.log('[processIntake] EXITO — Folio:', folioDsa);

    return {
      success: true,
      uuid: idInterno,
      folio: folioDsa,
      viewUrl: file.getUrl(),
      fileId: file.getId()
    };

  } catch (error) {
    console.error('[ExpedienteService] processIntake Failure:', error);
    return { success: false, error: 'Error en el servidor: ' + error.message };
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Ignorar si el lock no se pudo liberar o ya fue liberado
    }
  }
}

/**
 * Obtiene la biblioteca de expedientes con mapeo dinámico de columnas.
 * @returns {Array<Object>}
 */
function getExpedientesLibrary() {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0].map(h => String(h).toLowerCase());
    const find = (name) => headers.findIndex(h => h.includes(name));

    const idx = {
      uuid: find('uuid'),
      folio: find('folio_dsa') !== -1 ? find('folio_dsa') : find('folio'),
      tipo: find('tipo'),
      fecha: find('fecha_recepcion') !== -1 ? find('fecha_recepcion') : find('fecha'),
      servicio: find('servicio'),
      estado: find('estado') !== -1 ? find('estado') : find('estatus')
    };

    return data.slice(1).map(row => {
      const folio = idx.folio !== -1 ? String(row[idx.folio]) : 'N/A';
      const anioMatch = folio.match(/-(\d{4})-/);

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
    const user = getActiveUserSession();
    if (!user) return [];

    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0].map(h => String(h).toLowerCase());
    const find = (name) => headers.findIndex(h => h.includes(name));

    const colIdx = {
      uuid: find('uuid'),
      folio: find('folio_dsa') !== -1 ? find('folio_dsa') : find('folio'),
      servicio: find('servicio'),
      atiende: find('atiende'),
      estado: find('estado') !== -1 ? find('estado') : find('estatus')
    };

    const solicitudes = data.slice(1).map(row => {
      return {
        uuid: colIdx.uuid !== -1 ? row[colIdx.uuid] : '',
        folio: colIdx.folio !== -1 ? row[colIdx.folio] : 'N/A',
        servicio: colIdx.servicio !== -1 ? row[colIdx.servicio] : '',
        estado: colIdx.estado !== -1 ? row[colIdx.estado] : 'S01_RECEPCION',
        atiende: colIdx.atiende !== -1 ? row[colIdx.atiende] : ''
      };
    });

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
 * Utiliza mapeo dinámico de columnas para garantizar compatibilidad entre versiones de la base de datos.
 * 
 * @param {string} uuid - Identificador único del folio.
 * @returns {Object|null} Objeto con detalles del folio o null si no se encuentra.
 */
function getFolioDetails(uuid) {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    
    if (!sheet) {
      console.error('[GetFolioDetails] No se encontró la hoja de expedientes ni la base de datos.');
      return null;
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    const headers = data[0].map(h => String(h).toLowerCase());
    const findIdx = (name) => headers.findIndex(h => h.includes(name));

    const colIdx = {
      uuid: findIdx('uuid'),
      folio: findIdx('folio_dsa') !== -1 ? findIdx('folio_dsa') : findIdx('folio'),
      servicio: findIdx('servicio'),
      estado: findIdx('estado') !== -1 ? findIdx('estado') : findIdx('estatus'),
      url: findIdx('drive') !== -1 ? findIdx('drive') : findIdx('url'),
      oficio: findIdx('oficio'),
      tipo: findIdx('tipo')
    };

    // Validar que al menos el UUID sea localizable
    if (colIdx.uuid === -1) {
      console.error('[GetFolioDetails] No se pudo localizar la columna UUID en la cabecera.');
      return null;
    }

    const row = data.find(r => r[colIdx.uuid] === uuid);
    if (!row) {
      console.warn(`[GetFolioDetails] No se encontró el UUID ${uuid} en la hoja.`);
      return null;
    }

    const driveRef = colIdx.url !== -1 ? String(row[colIdx.url]) : '';
    let pdfFileId = '';

    if (driveRef) {
      try {
        const folderIdMatch = driveRef.match(/[-\w]{25,}/);
        if (folderIdMatch) {
          const folder = DriveApp.getFolderById(folderIdMatch[0]);
          const files = folder.getFilesByType(MimeType.PDF);
          if (files.hasNext()) pdfFileId = files.next().getId();
        }
      } catch (e) {
        console.warn(`[GetFolioDetails] I/O Drive Error para ${uuid}: ${e.message}`);
      }
    }

    return {
      uuid: row[colIdx.uuid],
      folio: colIdx.folio !== -1 ? row[colIdx.folio] : 'N/A',
      servicio: colIdx.servicio !== -1 ? row[colIdx.servicio] : 'N/A',
      estado: colIdx.estado !== -1 ? row[colIdx.estado] : 'S01_RECEPCION',
      pdfFileId: pdfFileId,
      data: {
        oficio_solicitud: colIdx.oficio !== -1 ? row[colIdx.oficio] : '',
        tipo_tramite: colIdx.tipo !== -1 ? row[colIdx.tipo] : ''
      }
    };

  } catch (error) {
    console.error('[ExpedienteService] getFolioDetails Error:', error);
    return null;
  }
}

/**
 * Procesa en lote los bienes/servicios extraídos vía OCR y los vincula a un folio.
 * Implementa LockService para garantizar la exclusión mutua durante la escritura masiva.
 * 
 * @param {Object} payloadData - Payload con formData, ocrItems y fileId.
 * @returns {Object} ResponseDTO {success, folio, uuid, error}
 */
function processOcrItemsBatch(payloadData) {
  const lock = LockService.getScriptLock();
  console.log('[processOcrItemsBatch] Iniciando transacción de lote...');
  
  try {
    // 1. Bloqueo de concurrencia (15s)
    lock.waitLock(15000);

    // 2. Ejecutar la creación del folio (proceso base)
    // Nota: processIntake ya gestiona su propia atomicidad para el folio.
    const intakeRes = processIntake(payloadData);
    if (!intakeRes.success) throw new Error(intakeRes.error);

    const uuid = intakeRes.uuid;
    const items = payloadData.ocrItems || [];

    if (items.length > 0) {
      const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
      const sheetBienes = ss.getSheetByName(SHEETS.BIENES) || ss.insertSheet(SHEETS.BIENES);
      
      // Asegurar cabeceras si la hoja es nueva
      if (sheetBienes.getLastRow() === 0) {
        sheetBienes.appendRow(['UUID_Folio', 'CodigoInsumo', 'Descripcion', 'CantidadSolicitada', 'UnidadMedida', 'ClaveCatalogo']);
      }

      // 3. Mapear items a matriz 2D: [[UUID_Folio, CodigoInsumo, Descripcion, CantidadSolicitada, UnidadMedida, ClaveCatalogo]]
      const matrix = items.map(item => [
        uuid,
        String(item.codigo_insumo || ''),
        String(item.descripcion || ''),
        String(item.cantidad_solicitada || ''),
        String(item.unidad_medida || ''),
        String(item.clave_catalogo || '')
      ]);

      // 4. Escritura en Batch (getLastRow + 1)
      const lastRow = sheetBienes.getLastRow();
      sheetBienes.getRange(lastRow + 1, 1, matrix.length, 6).setValues(matrix);

      // 5. Auditoría en Hoja 'Flujo' (Objeto de Auditoría punto [3])
      const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
      if (sheetFlujo) {
        const atiende = payloadData.formData.atiende || 'SISTEMA';
        const auditLog = [
          uuid,
          new Date(),
          'OCR_EXTRACTION',
          'S01_RECEPCION',
          'S01_RECEPCION',
          atiende,
          `Registro de ${items.length} insumos/servicios vía Gemini`
        ];
        sheetFlujo.appendRow(auditLog);
      }
      
      console.log(`[processOcrItemsBatch] Se registraron ${items.length} bienes para el folio ${intakeRes.folio}`);
    }

    SpreadsheetApp.flush();
    return intakeRes;

  } catch (err) {
    console.error('[ExpedienteService] processOcrItemsBatch Failure:', err);
    return { success: false, error: 'Error en procesamiento por lotes: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
