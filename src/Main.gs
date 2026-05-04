/**
 * Punto de entrada del Web App.
 *
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('ui/Index')
    .evaluate()
    .setTitle(APP_CONFIG.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Incluye un archivo HTML parcial en el template actual.
 * Implementa caché para reducir latencia, configurable vía PropertiesService.
 *
 * @param {string} filename Ruta relativa al archivo sin extensión.
 * @returns {string} Contenido HTML del archivo.
 */
function include(filename) {
  const props = PropertiesService.getScriptProperties();
  const isDev = props.getProperty('DEV_MODE') === 'true';
  
  if (!isDev) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'html_v3_' + filename.replace(/\//g, '_');
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    try {
      const content = HtmlService.createHtmlOutputFromFile(filename).getContent();

      // Limitación de CacheService: máximo 100KB por entrada
      const sizeBytes = content.length * 2; // Estimación simple para UTF-16
      if (sizeBytes < 100000) {
        cache.put(cacheKey, content, 21600); // 6 horas
      } else {
        console.warn(`[Main] El archivo ${filename} excede los 100KB (%s bytes) y no será cacheado.`, sizeBytes);
      }

      return content;
    } catch (e) {
      const errorMsg = `[Main] Error en include(${filename}): ${e.message}`;
      console.error(errorMsg);
      return `<!-- Error: ${filename} no encontrado. Detalle: ${e.message} -->`;
    }
  }

  // Modo desarrollo: Lectura directa sin caché
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    return `<!-- Error: ${filename} no encontrado -->`;
  }
}

