/**
 * Endpoints RPC para el Frontend relacionados con el Workflow FSM.
 *
 * CORRECCIONES v2:
 *  - BUG-09 FIX: El rol del usuario estaba hardcodeado como 'DSA' y el email
 *    de fallback era 'test@example.com'. Esto otorgaba permisos de administrador
 *    a TODOS los usuarios autenticados en producción. Corregido leyendo el rol
 *    real desde getActiveUserSession() (con caché de 30 min).
 */

/**
 * Obtiene las acciones disponibles para un folio según estado y rol real del usuario.
 *
 * @param {string} uuid_folio
 * @returns {Array<string>}
 */
function getAvailableActionsEndpoint(uuid_folio) {
  try {
    // FIX BUG-09: Leer rol y email desde la sesión real (caché CacheService 30 min).
    // Antes: userRole: 'DSA' hardcodeado → cualquier usuario podía actuar como DSA.
    // Antes: email fallback 'test@example.com' → artefacto de desarrollo en producción.
    const session = getActiveUserSession();

    if (!session) {
      console.warn('[WorkflowEndpoints] getAvailableActions: usuario sin sesión activa.');
      return [];
    }

    const sessionContext = {
      userRole:  session.role  || 'VIEWER',
      userEmail: session.email || ''
    };

    return WorkflowEngine.getAvailableActions(uuid_folio, sessionContext);

  } catch (error) {
    console.error('[WorkflowEndpoints] Error en getAvailableActionsEndpoint:', error);
    return [];
  }
}

/**
 * Despacha un evento desde el frontend para realizar una transición en el FSM.
 *
 * @param {string} uuid_folio
 * @param {string} event
 * @param {Object} [payload={}]
 * @returns {Object} {success, newState, error}
 */
function dispatchWorkflowEventEndpoint(uuid_folio, event, payload = {}) {
  try {
    // FIX BUG-09: Usar email real de sesión en lugar de fallback de desarrollo.
    const session = getActiveUserSession();
    payload.userEmail = session?.email || Session.getActiveUser().getEmail() || '';

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
 * Retorna la configuración necesaria para instanciar el Google Picker.
 *
 * @returns {{ oauthToken, folderId, developerKey, projectNumber }}
 */
function getPickerConfig() {
  try {
    const oauthToken   = ScriptApp.getOAuthToken();
    const folderId     = CONFIG.OCR_BUFFER_FOLDER_ID;
    const developerKey = CONFIG.GOOGLE_DEV_KEY;
    const projectNumber = CONFIG.GOOGLE_PROJECT_NUMBER;

    if (!folderId)      throw new Error('OCR_BUFFER_FOLDER_ID no configurado.');
    if (!developerKey)  throw new Error('GOOGLE_DEV_KEY no configurada.');
    if (!projectNumber) throw new Error('GOOGLE_PROJECT_NUMBER no configurado.');

    return { oauthToken, folderId, developerKey, projectNumber };

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
 *
 * @param {string} fileId ID del archivo en Google Drive.
 * @returns {Object} Datos estructurados o { success: false, error }.
 */
function processOcrEndpoint(fileId) {
  try {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('fileId inválido o ausente.');
    }

    console.log('--- Iniciando OCR para archivo: %s ---', fileId);
    const driveFile = DriveApp.getFileById(fileId);

    if (!driveFile) {
      throw new Error('El archivo PDF no existe o fue eliminado.');
    }

    const blob     = driveFile.getBlob();
    const bytes    = blob.getBytes();
    const mimeType = blob.getContentType();

    const MAX_SIZE = 15 * 1024 * 1024;
    if (bytes.length > MAX_SIZE) {
      throw new Error('El archivo excede los 15MB permitidos para el análisis IA.');
    }

    console.log('[OCR Endpoint] Archivo cargado — MIME: %s, Size: %s bytes', mimeType, bytes.length);

    const base64Data = Utilities.base64Encode(bytes);
    return OcrService.analyzeDocumentWithGemini(base64Data, mimeType);

  } catch (e) {
    console.error('ERROR EN OCR ENDPOINT: %s', e.message);
    return { success: false, error: e.message };
  }
}
