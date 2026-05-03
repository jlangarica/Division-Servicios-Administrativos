/**
 * Endpoints RPC para el Frontend relacionados con el Workflow FSM.
 * Funciones expuestas a google.script.run
 */

/**
 * Obtiene las acciones (eventos) disponibles para un folio específico
 * según el estado actual y el contexto del usuario en sesión.
 * 
 * @param {string} uuid_folio ID único del expediente.
 * @returns {Array<string>} Lista de eventos válidos (ej. ['ADVANCE', 'REJECT']).
 */
function getAvailableActionsEndpoint(uuid_folio) {
  try {
    // En un sistema real, extraeríamos el rol del usuario desde la sesión o caché
    // Aquí simulamos que el usuario tiene el rol 'DSA'
    const sessionContext = {
      userRole: 'DSA',
      userEmail: Session.getActiveUser().getEmail() || 'test@example.com'
    };

    return WorkflowEngine.getAvailableActions(uuid_folio, sessionContext);
  } catch (error) {
    console.error('[WorkflowEndpoints] Error en getAvailableActionsEndpoint:', error);
    return []; // Fallback seguro: no mostrar acciones
  }
}

/**
 * Despacha un evento desde el frontend para realizar una transición en el FSM.
 * 
 * @param {string} uuid_folio ID único del expediente.
 * @param {string} event Nombre del evento a despachar (ej. 'ADVANCE').
 * @param {Object} [payload={}] Datos adicionales para la transición (ej. { reason: 'No cumple requisitos' }).
 * @returns {Object} Respuesta estándar de la API { success, newState, error }.
 */
function dispatchWorkflowEventEndpoint(uuid_folio, event, payload = {}) {
  try {
    // Inyectar datos de sesión en el payload para auditoría
    payload.userEmail = Session.getActiveUser().getEmail() || 'test@example.com';

    return WorkflowRepository.dispatchEvent(uuid_folio, event, payload);
  } catch (error) {
    console.error('[WorkflowEndpoints] Error en dispatchWorkflowEventEndpoint:', error);
    return { success: false, error: 'Error del servidor al procesar la transición.' };
  }
}


// ────────────────────────────────────────────────────────
//  GOOGLE PICKER — Configuración de Credenciales
// ────────────────────────────────────────────────────────

/**
 * Retorna la configuración necesaria para instanciar el Google Picker
 * en el frontend. No expone API Keys — solo el token OAuth de la sesión
 * activa y el ID de la carpeta buffer.
 *
 * @returns {{ oauthToken: string, folderId: string }}
 */
function getPickerConfig() {
  try {
    const oauthToken = ScriptApp.getOAuthToken();
    const folderId = CONFIG.OCR_BUFFER_FOLDER_ID;

    if (!folderId) {
      throw new Error('OCR_BUFFER_FOLDER_ID no configurado en ScriptProperties.');
    }

    return { oauthToken, folderId };
  } catch (error) {
    console.error('[WorkflowEndpoints] Error en getPickerConfig:', error);
    throw new Error('No se pudo obtener la configuración del Picker: ' + error.message);
  }
}


// ────────────────────────────────────────────────────────
//  OCR — Ingesta via FileId + Atomic Trash
// ────────────────────────────────────────────────────────

/**
 * Endpoint RPC para extracción OCR con Gemini AI.
 * Recibe un fileId de Drive (subido por Picker), extrae el blob,
 * lo envía a Gemini y elimina atómicamente el archivo temporal.
 *
 * REGLA DE ORO: "No Base64 in RPC" — el binario viaja por Drive, no por parámetros.
 * REGLA DE ORO: "Atomic Trash" — el archivo se elimina en la misma ejecución, sin excepciones.
 *
 * @param {string} fileId ID del archivo en Google Drive (subido por Picker).
 * @returns {Object} Datos estructurados extraídos, o { success: false, error }.
 */
function processOcrEndpoint(fileId) {
  /** @type {GoogleAppsScript.Drive.File|null} */
  let driveFile = null;

  try {
    // 0. Validación del fileId
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('fileId inválido o ausente.');
    }

    // 1. Ingesta — Obtener el blob del archivo desde Drive
    console.log('--- Iniciando OCR para archivo: %s ---', fileId);
    driveFile = DriveApp.getFileById(fileId);

    const blob = driveFile.getBlob();
    const bytes = blob.getBytes();
    const mimeType = blob.getContentType();

    // 2. Validar tamaño (Gemini tiene límite de ~15MB por petición inline)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (bytes.length > MAX_SIZE) {
      throw new Error('El archivo excede los 15MB permitidos para el análisis IA.');
    }

    console.log(
      '[OCR Endpoint] Archivo cargado — MIME: %s, Size: %s bytes',
      mimeType,
      bytes.length
    );

    // 3. Análisis — Ejecutar extracción AI
    const base64Data = Utilities.base64Encode(bytes);
    const result = OcrService.analyzeDocumentWithGemini(base64Data, mimeType);

    return result;

  } catch (e) {
    console.error('ERROR EN OCR ENDPOINT: %s', e.message);
    return { success: false, error: e.message };

  } finally {
    // 4. Clean-up Atómico — SIEMPRE mover a papelera
    if (driveFile) {
      try {
        driveFile.setTrashed(true);
        console.log('[OCR Endpoint] Archivo efímero eliminado: %s', fileId);
      } catch (trashError) {
        console.error('[OCR Endpoint] FALLO al eliminar archivo temporal:', trashError.message);
      }
    }
  }
}
