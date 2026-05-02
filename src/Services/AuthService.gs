/**
 * Servicio de autenticación y gestión de sesiones.
 *
 * @fileoverview Valida al usuario activo contra la lista blanca del Spreadsheet
 * de configuración. Implementa CacheService para reducir lecturas al Sheet
 * y mejorar el tiempo de respuesta en sub-siguientes peticiones.
 *
 * Patron: Cache-aside con TTL configurable.
 */

/**
 * Estructura de transferencia de datos de usuario.
 * @typedef {Object} UserDTO
 * @property {string} id     - Identificador único del usuario.
 * @property {string} name   - Nombre completo.
 * @property {string} email  - Correo electrónico institucional.
 * @property {string} role   - Rol asignado en el sistema.
 * @property {string} prefix - Prefijo de tratamiento (Dr., Lic., etc.).
 */

/**
 * Obtiene la sesión del usuario activo validando contra la lista blanca.
 *
 * Flujo:
 *  1. Obtiene el email del usuario activo de Session.
 *  2. Busca en caché (hit → retorna inmediatamente).
 *  3. Miss → lee el Sheet en batch, busca en memoria.
 *  4. Guarda resultado en caché y lo retorna.
 *
 * @returns {UserDTO|null} DTO del usuario o null si no está autorizado.
 */
function getActiveUserSession() {
  const userEmail = Session.getActiveUser().getEmail();

  if (!userEmail) {
    console.warn('[Auth] No se pudo obtener el correo del usuario activo.');
    return null;
  }

  // --- Cache lookup ---
  const cache = CacheService.getScriptCache();
  const cacheKey = 'user_session_' + userEmail;
  const cached = cache.get(cacheKey);

  if (cached) {
    console.log('[Auth] Cache HIT para: ' + userEmail);
    return JSON.parse(cached);
  }

  console.log('[Auth] Cache MISS para: ' + userEmail + ' — consultando Sheet.');

  // --- Sheet lookup ---
  try {
    const userDTO = lookupUserInSheet(userEmail);

    if (!userDTO) {
      console.warn('[Auth] Acceso denegado: ' + userEmail + ' no registrado.');
      return null;
    }

    // Guardar en caché
    cache.put(cacheKey, JSON.stringify(userDTO), CACHE_TTL.USER_SESSION);
    console.log('[Auth] Sesión cacheada para: ' + userEmail);

    return userDTO;

  } catch (error) {
    console.error('[Auth] Error en getActiveUserSession:', error);
    return null;
  }
}

/**
 * Busca un usuario en el Spreadsheet de configuración.
 * Utiliza lectura en bloque (batch read) para minimizar llamadas a la API.
 *
 * @param {string} email Correo electrónico a buscar.
 * @returns {UserDTO|null}
 * @private
 */
function lookupUserInSheet(email) {
  const ss = SpreadsheetApp.openById(SS_CONFIG_ID);
  const sheet = ss.getSheetByName(SHEETS.USUARIOS);

  if (!sheet) {
    throw new Error('Hoja "' + SHEETS.USUARIOS + '" no encontrada en Spreadsheet de configuración.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null; // Sin datos

  // Batch read: A2:E{lastRow}
  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const emailLower = email.toLowerCase();

  const userRow = data.find(function(row) {
    return row[2] && String(row[2]).toLowerCase() === emailLower;
  });

  if (!userRow) return null;

  return {
    id:     String(userRow[0]),
    name:   String(userRow[1]),
    email:  String(userRow[2]),
    role:   String(userRow[3]),
    prefix: String(userRow[4]),
  };
}
