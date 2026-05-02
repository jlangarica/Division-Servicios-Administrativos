/**
 * Estructura de transferencia de datos de usuario.
 * @interface UserDTO
 */


/**
 * Obtiene la sesión del usuario activo validando contra la lista blanca en Google Sheets.
 * Implementa CacheService para optimizar el rendimiento.
 * 
 * @returns {UserDTO | null} Objeto de usuario o null si no está autorizado.
 */
function getActiveUserSession() {
  const userEmail = Session.getActiveUser().getEmail();
  
  if (!userEmail) {
    console.warn("No se pudo identificar el correo del usuario activo.");
    return null;
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = `user_session_${userEmail}`;
  const cachedSession = cache.get(cacheKey);

  if (cachedSession) {
    console.log(`Sesión recuperada de caché para: ${userEmail}`);
    return JSON.parse(cachedSession);
  }

  try {
    const ss = SpreadsheetApp.openById(SS_CONFIG_ID);
    const sheet = ss.getSheetByName(SHEETS.USUARIOS);
    
    if (!sheet) {
      throw new Error(`No se encontró la hoja "${SHEETS.USUARIOS}" en el Spreadsheet de configuración.`);
    }

    // Lectura en bloque (Batch)
    const data = sheet.getRange("A2:E" + sheet.getLastRow()).getValues();

    // Búsqueda en memoria
    const userRow = data.find(row => row[2] && String(row[2]).toLowerCase() === userEmail.toLowerCase());

    if (!userRow) {
      console.warn(`Acceso denegado: ${userEmail} no está registrado.`);
      return null;
    }

    const userSession = {
      id: String(userRow[0]),
      name: String(userRow[1]),
      email: String(userRow[2]),
      role: String(userRow[3]),
      prefix: String(userRow[4])
    };

    // Guardar en caché por 30 minutos (1800 segundos)
    cache.put(cacheKey, JSON.stringify(userSession), 1800);
    console.log(`Nueva sesión generada y cacheada para: ${userEmail}`);

    return userSession;

  } catch (error) {
    console.error("Error en getActiveUserSession:", error);
    return null;
  }
}
