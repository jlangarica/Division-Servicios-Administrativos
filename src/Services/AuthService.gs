/**
 * Servicio de autenticación y gestión de sesiones.
 *
 * @fileoverview Valida al usuario activo contra la lista blanca del Spreadsheet
 * de configuración. Implementa CacheService para reducir lecturas al Sheet.
 *
 * @typedef {Object} UserDTO
 * @property {string} id     - Identificador único del usuario.
 * @property {string} name   - Nombre completo.
 * @property {string} email  - Correo electrónico institucional.
 * @property {string} role   - Rol asignado en el sistema.
 * @property {string} prefix - Prefijo de tratamiento (Dr., Lic., etc.).
 */

/**
 * Obtiene la sesión del usuario activo validando contra la lista blanca.
 * @returns {UserDTO|null} DTO del usuario o null si no está autorizado.
 */
function getActiveUserSession() {
  try {
    const activeUser = Session.getActiveUser();
    const userEmail = activeUser ? activeUser.getEmail().toLowerCase() : null;

    if (!userEmail) {
      console.warn('[Auth] No se pudo obtener el correo del usuario activo (Session.getActiveUser() null).');
      return null;
    }

    // --- Cache lookup (Individual user) ---
    const cache = CacheService.getScriptCache();
    const cacheKey = 'user_session_' + userEmail;
    const cached = cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    console.log('[Auth] Cache MISS para: ' + userEmail + ' — consultando Sheet.');

    // --- Sheet lookup ---
    const userDTO = lookupUserInSheet(userEmail);

    if (!userDTO) {
      console.warn('[Auth] Acceso denegado: ' + userEmail + ' no registrado.');
      return null;
    }

    // Guardar en caché con el TTL configurado
    cache.put(cacheKey, JSON.stringify(userDTO), CACHE_TTL.USER_SESSION);
    return userDTO;

  } catch (error) {
    console.error('[Auth] Error crítico en getActiveUserSession:', error);
    return null;
  }
}

/**
 * Busca un usuario en el Spreadsheet de configuración.
 * Implementa una estrategia de caché para el mapa completo de usuarios.
 *
 * @param {string} email Correo electrónico a buscar.
 * @returns {UserDTO|null}
 * @private
 */
function lookupUserInSheet(email) {
  const cache = CacheService.getScriptCache();
  const mapCacheKey = 'all_users_map_v2';
  const cachedMap = cache.get(mapCacheKey);
  
  let userMapData;

  if (cachedMap) {
    userMapData = JSON.parse(cachedMap);
  } else {
    // Lectura en bloque desde el Spreadsheet
    const ss = SpreadsheetApp.openById(SS_CONFIG_ID);
    const sheet = ss.getSheetByName(SHEETS.USUARIOS);
    if (!sheet) throw new Error('Hoja de usuarios no encontrada en Config Spreadsheet');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    userMapData = {};

    for (const row of data) {
      const rowEmail = row[2] ? String(row[2]).toLowerCase().trim() : null;
      if (rowEmail) {
        userMapData[rowEmail] = {
          id: String(row[0]),
          name: String(row[1]),
          email: rowEmail,
          role: String(row[3]),
          prefix: String(row[4]),
        };
      }
    }
    
    // Intentar cachear el mapa completo si no excede el límite de 100KB
    try {
      const serialized = JSON.stringify(userMapData);
      if (serialized.length < 100000) {
        cache.put(mapCacheKey, serialized, CACHE_TTL.LOOKUP_DATA);
      }
    } catch (e) {
      console.warn('[Auth] Mapa de usuarios demasiado grande para CacheService');
    }
  }

  return userMapData[email] || null;
}

