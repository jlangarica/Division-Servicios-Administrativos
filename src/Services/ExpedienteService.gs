/**
 * Servicio para la gestión de expedientes y recepción de oficios.
 *
 * CORRECCIONES v2:
 *  - BUG #1 FIX: Eliminado DEADLOCK de LockService.
 *    processOcrItemsBatch() adquiría el lock y luego llamaba a processIntake()
 *    que intentaba adquirir el MISMO lock → GAS LockService no es re-entrante →
 *    waitLock(15000) agotaba el tiempo → Exception → hoja 'Detalles' nunca recibía datos.
 *    SOLUCIÓN: Extraída la lógica transaccional de processIntake a _executeIntakeCore()
 *    (función privada sin lock). processIntake() pública gestiona su propio lock.
 *    processOcrItemsBatch() llama a _executeIntakeCore() dentro de su lock ya adquirido.
 *
 *  - BUG #2 FIX: .replace(/\D/g, '') reemplazado por .trim().
 *    El regex anterior destruía códigos como "6010.01" → "601001", haciendo
 *    que las consultas Supabase no encontraran ningún registro.
 */

// ============================================================================
//  FUNCIÓN PRIVADA INTERNA — Sin Lock (llamada desde dentro de un lock ya activo)
// ============================================================================

/**
 * Núcleo transaccional del intake. NO usa LockService.
 * Debe ser invocada SIEMPRE dentro de un lock ya adquirido por el caller.
 *
 * @param {Object} payload - {fileId, formData, ocrItems}
 * @returns {Object} {success, uuid, folio, viewUrl, fileId, folderId, error}
 * @private
 */
function _executeIntakeCore(payload) {
  // 1. Validación inicial del payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.error('[_executeIntakeCore] Payload no es un objeto válido');
    return { success: false, error: 'Payload vacío o inválido.' };
  }

  const fileId   = payload.fileId;
  const formData = payload.formData;
  const ocrItems = Array.isArray(payload.ocrItems) ? payload.ocrItems : [];

  console.log('[_executeIntakeCore] fileId:', fileId, '| ocrItems:', ocrItems.length);

  if (!fileId || String(fileId).trim() === '') {
    return { success: false, error: 'Falta el identificador del archivo PDF.' };
  }

  if (!formData || typeof formData !== 'object') {
    return { success: false, error: 'Faltan los datos del formulario.' };
  }

  const requiredFields = ['tipo_tramite', 'fecha_recepcion', 'servicio_solicitante', 'oficio_solicitud'];
  for (const field of requiredFields) {
    if (!formData[field] || !String(formData[field]).trim()) {
      console.error('[_executeIntakeCore] Campo requerido faltante:', field);
      return { success: false, error: `El campo [${field}] es obligatorio.` };
    }
  }

  const cleanFileId = String(fileId);
  const ss          = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
  const sheet       = ss.getSheetByName(SHEETS.BASE_DATOS) || ss.getSheets()[0];
  const lastRow     = sheet.getLastRow();

  // Verificación de duplicados por Referencia (Columna G - Oficio Solicitud)
  const dataRange = lastRow > 1
    ? sheet.getRange(2, 7, lastRow - 1, 1).getValues().flat()
    : [];
  if (dataRange.includes(formData.oficio_solicitud.trim())) {
    return { success: false, error: 'Este número de oficio ya ha sido registrado previamente.' };
  }

  // Generación de Folio y Metadatos
  const correlativo    = Math.max(1, lastRow);
  const anio           = new Date().getFullYear();
  const idInterno      = generateUUID();
  const folioDsa       = `DSA-${anio}-${String(correlativo).padStart(3, '0')}`;

  // Formateo de fecha ISO a Regional (DD/MM/YYYY)
  let fechaFormateada = formData.fecha_recepcion;
  const partes = formData.fecha_recepcion.split('-');
  if (partes.length === 3) {
    fechaFormateada = `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  // Operaciones en Google Drive
  const rootFolder      = DriveApp.getFolderById(DRIVE_CONFIG.EXPEDIENTES_FOLDER_ID);
  const expedienteFolder = rootFolder.createFolder(`Folio_${folioDsa}_DSA`);

  const sourceFile = DriveApp.getFileById(cleanFileId);
  const fileName   = sourceFile.getName();
  const blob       = sourceFile.getBlob();
  blob.setName(`Oficio_${folioDsa}_${fileName}`);
  const file = expedienteFolder.createFile(blob);

  try {
    sourceFile.setTrashed(true);
    console.log('[_executeIntakeCore] Archivo buffer eliminado: %s', cleanFileId);
  } catch (trashErr) {
    console.warn('[_executeIntakeCore] No se pudo eliminar archivo buffer:', trashErr.message);
  }

  // Persistencia en Sheet 'Expedientes'
  const timestamp = new Date();
  const sheetExp  = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);

  if (!sheetExp) {
    throw new Error('No se encontró la hoja de destino.');
  }

  const rowData = [
    idInterno,
    folioDsa,
    formData.tipo_tramite,
    fechaFormateada,
    formData.servicio_solicitante,
    formData.oficio_solicitud.trim(),
    formData.atiende,
    'S01_RECEPCION',
    timestamp,
    'DSA',
    '',
    expedienteFolder.getId()
  ];

  sheetExp.appendRow(rowData);

  // Registrar Evento en Flujo
  const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
  if (sheetFlujo) {
    sheetFlujo.appendRow([
      idInterno,
      timestamp,
      'INIT_PROCESS',
      'NONE',
      'S01_RECEPCION',
      formData.atiende,
      `Recepción de documento físico. OCR items: ${ocrItems.length}`
    ]);
  }

  SpreadsheetApp.flush();

  console.log('[_executeIntakeCore] ÉXITO — Folio:', folioDsa);

  return {
    success:  true,
    uuid:     idInterno,
    folio:    folioDsa,
    viewUrl:  file.getUrl(),
    fileId:   file.getId(),
    folderId: expedienteFolder.getId()
  };
}


// ============================================================================
//  API PÚBLICA — processIntake (llamada directa desde el frontend)
// ============================================================================

/**
 * Registra el ingreso de un oficio, creando una entidad digital centralizada.
 * Gestiona su propio LockService para garantizar la atomicidad del folio.
 *
 * CORRECCIÓN BUG #1: Esta función ya NO es llamada desde processOcrItemsBatch.
 * Ambas funciones usan _executeIntakeCore() internamente para evitar el deadlock
 * de LockService (LockService.getScriptLock no es re-entrante en GAS).
 *
 * @param {Object} payload - {fileId, formData, ocrItems}
 * @returns {Object} {success, folio, viewUrl, fileId, error}
 */
function processIntake(payload) {
  console.log('[processIntake] INICIO — Procesando payload');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    return _executeIntakeCore(payload);
  } catch (error) {
    console.error('[processIntake] Failure:', error);
    return { success: false, error: 'Error en el servidor: ' + error.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ============================================================================
//  PROCESAMIENTO POR LOTES (OCR + Detalles + Supabase)
// ============================================================================

/**
 * Procesa en lote los bienes/servicios extraídos vía OCR y los vincula a un folio.
 *
 * CORRECCIÓN BUG #1: Se eliminó la llamada a processIntake() (que causaba deadlock).
 * Ahora se llama directamente a _executeIntakeCore() dentro del lock ya adquirido.
 *
 * CORRECCIÓN BUG #2: Los códigos de artículo ya NO se limpian con .replace(/\D/g,'').
 * Se usa .trim() para preservar el código tal como viene del OCR (ej. "6010.01"),
 * garantizando que coincida con los valores almacenados en la columna TEXT de Supabase.
 *
 * @param {Object} payloadData - {formData, ocrItems, fileId}
 * @returns {Object} ResponseDTO {success, folio, uuid, error}
 */
function processOcrItemsBatch(payloadData) {
  const lock = LockService.getScriptLock();
  console.log('[processOcrItemsBatch] Iniciando transacción de lote...');

  try {
    // 1. Bloqueo de concurrencia (15s)
    lock.waitLock(15000);

    console.log('[processOcrItemsBatch] typeof payloadData:', typeof payloadData);
    console.log('[processOcrItemsBatch] keys:', Object.keys(payloadData || {}));

    // 2. FIX BUG #1: Llamar a _executeIntakeCore() en lugar de processIntake().
    //    processIntake() intentaría adquirir el lock que YA tenemos → DEADLOCK.
    //    _executeIntakeCore() ejecuta la misma lógica transaccional SIN lock propio.
    const intakeRes = _executeIntakeCore(payloadData);
    if (!intakeRes.success) throw new Error(intakeRes.error);

    const uuid = intakeRes.uuid;

    // ─── DESERIALIZACIÓN SEGURA de ocrItems ───
    let items = [];
    const rawItems = payloadData.ocrItems;

    if (typeof rawItems === 'string' && rawItems.length > 2) {
      try {
        items = JSON.parse(rawItems);
        console.log('[processOcrItemsBatch] Items deserializados desde JSON string:', items.length);
      } catch (parseErr) {
        console.error('[processOcrItemsBatch] Error al parsear ocrItems string:', parseErr.message);
      }
    } else if (Array.isArray(rawItems)) {
      items = rawItems;
      console.log('[processOcrItemsBatch] Items recibidos como Array nativo:', items.length);
    } else {
      console.warn('[processOcrItemsBatch] ocrItems no reconocido. Tipo:', typeof rawItems);
    }

    console.log('[processOcrItemsBatch] Total items a procesar:', items.length);
    if (items.length > 0) {
      console.log('[processOcrItemsBatch] Primer item:', JSON.stringify(items[0]));
    }

    if (items.length > 0) {
      const ss          = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
      const sheetBienes = ss.getSheetByName(SHEETS.BIENES) || ss.insertSheet(SHEETS.BIENES);

      // Asegurar cabeceras si la hoja es nueva
      if (sheetBienes.getLastRow() === 0) {
        sheetBienes.appendRow([
          'uuid_detalle', 'uuid_folio_fk', 'codigo', 'descripcion',
          'unidad_medida', 'cantidad_solicitada', 'partida_presupuestal',
          'precio_unitario_sin_iva', 'subtotal', 'iva', 'precio_unitario_con_iva'
        ]);
      }

      // Mapear items a matriz 2D (11 columnas)
      const matrix = items.map(item => [
        generateUUID(),
        uuid,
        String(item.codigo_insumo || ''),
        String(item.descripcion   || ''),
        String(item.unidad_medida || ''),
        String(item.cantidad_solicitada || ''),
        '', '', '', '', ''
      ]);

      // Escritura en Batch
      const lastRow = sheetBienes.getLastRow();
      sheetBienes.getRange(lastRow + 1, 1, matrix.length, 11).setValues(matrix);

      // Auditoría en Hoja 'Flujo'
      const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
      if (sheetFlujo) {
        const atiende = payloadData.formData.atiende || 'SISTEMA';
        sheetFlujo.appendRow([
          uuid, new Date(), 'OCR_EXTRACTION', 'S01_RECEPCION', 'S01_RECEPCION',
          atiende, `Registro de ${items.length} insumos/servicios vía Gemini`
        ]);
      }

      console.log(`[processOcrItemsBatch] ${items.length} bienes registrados para folio ${intakeRes.folio}`);

      // ================================================================
      //  INTEGRACIÓN SUPABASE — Historial de Proveedores
      // ================================================================
      try {
        if (SupabaseService.isConfigured()) {

          // FIX BUG #2: Usar .trim() en lugar de .replace(/\D/g,'').
          //
          // El regex anterior eliminaba TODOS los caracteres no numéricos:
          //   "6010.01" → "601001"  (punto decimal destruido)
          //   "A-1234"  → "1234"    (prefijo de categoría destruido)
          //
          // Esto hacía que los códigos enviados a Supabase NUNCA coincidieran
          // con los valores TEXT almacenados en la columna mov_art_codigo.
          //
          // La solución correcta es preservar el código original (solo trim):
          const codigosPuros = items
            .map(i => String(i.codigo_insumo || '').trim())   // ← .trim() preserva el código
            .filter(val => val.length > 0);

          const codigosUnicos = [...new Set(codigosPuros)];

          if (codigosUnicos.length > 0) {
            console.log('[Supabase] Buscando historial para códigos:', codigosUnicos);
            const historial = SupabaseService.getHistorialPorCodigos(codigosUnicos);

            if (historial.length > 0) {
              const nombreSheet = `Historial_Proveedores_${intakeRes.folio}`;
              const newSs       = SpreadsheetApp.create(nombreSheet);

              const driveFile    = DriveApp.getFileById(newSs.getId());
              const targetFolder = DriveApp.getFolderById(intakeRes.folderId);
              driveFile.moveTo(targetFolder);

              const hoja     = newSs.getSheets()[0];
              hoja.setName('Historial');

              const cabeceras = [
                'CÓDIGO', 'ARTÍCULO (OCR/DB)', 'PROVEEDOR',
                'CANTIDAD COMPRADA', 'PRECIO UNIT.', 'IMPORTE SIN IVA',
                'FECHA ALBARÁN', 'AÑO', 'ALMACÉN'
              ];

              const dataSheet = [cabeceras];
              historial.forEach(row => {
                dataSheet.push([
                  row.mov_art_codigo,
                  row.mov_art_deno,
                  row.division_nom,
                  row.mov_cantidad,
                  row.mov_precio_lin,
                  row.siniva,
                  row.mov_fecha_alb,
                  row.mov_ejercicio,
                  row.almacen_deno
                ]);
              });

              hoja.getRange(1, 1, dataSheet.length, cabeceras.length).setValues(dataSheet);
              hoja.getRange('A1:I1').setFontWeight('bold').setBackground('#e8eaed').setFontFamily('DM Sans');
              hoja.setFrozenRows(1);
              hoja.autoResizeColumns(1, cabeceras.length);

              console.log(`[Supabase] Historial creado: ${historial.length} registros en ${nombreSheet}`);
            } else {
              console.log('[Supabase] Sin compras previas para estos insumos.');
            }
          }
        }
      } catch (errSupabase) {
        // Try-catch interno: si Supabase falla, el folio principal SÍ se guarda.
        console.error('[Supabase] Error no bloqueante al generar historial:', errSupabase);
      }
      // ================================================================
    }

    SpreadsheetApp.flush();
    return intakeRes;

  } catch (err) {
    console.error('[processOcrItemsBatch] Failure:', err);
    return { success: false, error: 'Error en procesamiento por lotes: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ============================================================================
//  FUNCIONES DE LECTURA (sin cambios — incluidas para completitud del archivo)
// ============================================================================

function getExpedientesLibrary() {
  try {
    const ss      = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheetBD = ss.getSheetByName(SHEETS.BASE_DATOS);
    const sheetExp = ss.getSheetByName(SHEETS.EXPEDIENTES);

    let sheet = sheetBD;
    if (!sheet || sheet.getLastRow() < 2) sheet = sheetExp;
    if (!sheet || sheet.getLastRow() < 2) {
      console.warn('[getExpedientesLibrary] No se encontró ninguna hoja con datos.');
      return [];
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const data    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0].map(h => String(h).toLowerCase());
    const find    = (name) => headers.findIndex(h => h.includes(name));

    const idx = {
      uuid:     find('uuid'),
      folio:    find('folio_dsa') !== -1 ? find('folio_dsa') : find('folio'),
      tipo:     find('tipo'),
      fecha:    find('fecha_recepcion') !== -1 ? find('fecha_recepcion') : find('fecha'),
      servicio: find('servicio'),
      estado:   find('estado') !== -1 ? find('estado') : find('estatus')
    };

    return data.slice(1).map(row => {
      const folio = idx.folio !== -1 ? String(row[idx.folio]) : 'S/F';
      let anio    = new Date().getFullYear().toString();
      const m     = folio.match(/-(\d{4})-/);
      if (m) {
        anio = m[1];
      } else if (idx.fecha !== -1 && row[idx.fecha] instanceof Date) {
        anio = row[idx.fecha].getFullYear().toString();
      }

      let fechaStr = 'N/A';
      if (idx.fecha !== -1 && row[idx.fecha]) {
        const val = row[idx.fecha];
        fechaStr = val instanceof Date
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy')
          : String(val);
      }

      return {
        uuid:     idx.uuid    !== -1 ? String(row[idx.uuid])    : '',
        folio:    folio,
        tipo:     idx.tipo    !== -1 ? String(row[idx.tipo])    : 'N/A',
        fecha:    fechaStr,
        servicio: idx.servicio !== -1 ? String(row[idx.servicio]) : 'N/A',
        estado:   idx.estado  !== -1 ? String(row[idx.estado]).toUpperCase() : 'S01_RECEPCION',
        anio:     anio
      };
    }).reverse();

  } catch (error) {
    console.error('[getExpedientesLibrary] Error:', error);
    return [];
  }
}


function getSolicitudesPorUsuario() {
  try {
    const user = getActiveUserSession();
    if (!user) return [];

    const ss    = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0].map(h => String(h).toLowerCase());
    const find    = (name) => headers.findIndex(h => h.includes(name));

    const colIdx = {
      uuid:     find('uuid'),
      folio:    find('folio_dsa') !== -1 ? find('folio_dsa') : find('folio'),
      servicio: find('servicio'),
      atiende:  find('atiende'),
      estado:   find('estado') !== -1 ? find('estado') : find('estatus')
    };

    return data.slice(1).map(row => ({
      uuid:     colIdx.uuid     !== -1 ? row[colIdx.uuid]     : '',
      folio:    colIdx.folio    !== -1 ? row[colIdx.folio]    : 'N/A',
      servicio: colIdx.servicio !== -1 ? row[colIdx.servicio] : '',
      estado:   colIdx.estado   !== -1 ? row[colIdx.estado]   : 'S01_RECEPCION',
      atiende:  colIdx.atiende  !== -1 ? row[colIdx.atiende]  : ''
    })).filter(s => !['FINALIZADO', 'S99_RECHAZADO'].includes(s.estado));

  } catch (error) {
    console.error('[getSolicitudesPorUsuario] Error:', error);
    return [];
  }
}


function getFolioDetails(uuid) {
  try {
    const ss    = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheet = ss.getSheetByName(SHEETS.EXPEDIENTES) || ss.getSheetByName(SHEETS.BASE_DATOS);
    if (!sheet) return null;

    const data    = sheet.getDataRange().getValues();
    if (data.length < 2) return null;

    const headers  = data[0].map(h => String(h).toLowerCase());
    const findIdx  = (name) => headers.findIndex(h => h.includes(name));

    const colIdx = {
      uuid:    findIdx('uuid'),
      folio:   findIdx('folio_dsa') !== -1 ? findIdx('folio_dsa') : findIdx('folio'),
      servicio: findIdx('servicio'),
      estado:  findIdx('estado')   !== -1 ? findIdx('estado')   : findIdx('estatus'),
      url:     findIdx('drive')    !== -1 ? findIdx('drive')    : findIdx('url'),
      oficio:  findIdx('oficio'),
      tipo:    findIdx('tipo')
    };

    if (colIdx.uuid === -1) return null;

    const row = data.find(r => r[colIdx.uuid] === uuid);
    if (!row) return null;

    const driveRef = colIdx.url !== -1 ? String(row[colIdx.url]) : '';
    let pdfFileId  = '';

    if (driveRef) {
      try {
        const m = driveRef.match(/[-\w]{25,}/);
        if (m) {
          const folder = DriveApp.getFolderById(m[0]);
          const files  = folder.getFilesByType(MimeType.PDF);
          if (files.hasNext()) pdfFileId = files.next().getId();
        }
      } catch (e) {
        console.warn(`[getFolioDetails] Drive error para ${uuid}: ${e.message}`);
      }
    }

    return {
      uuid:      row[colIdx.uuid],
      folio:     colIdx.folio    !== -1 ? row[colIdx.folio]    : 'N/A',
      servicio:  colIdx.servicio !== -1 ? row[colIdx.servicio] : 'N/A',
      estado:    colIdx.estado   !== -1 ? row[colIdx.estado]   : 'S01_RECEPCION',
      pdfFileId: pdfFileId,
      data: {
        oficio_solicitud: colIdx.oficio !== -1 ? row[colIdx.oficio] : '',
        tipo_tramite:     colIdx.tipo   !== -1 ? row[colIdx.tipo]   : ''
      }
    };

  } catch (error) {
    console.error('[getFolioDetails] Error:', error);
    return null;
  }
}