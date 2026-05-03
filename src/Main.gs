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
    const cacheKey = 'html_v2_' + filename.replace(/\//g, '_');
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    try {
      const content = HtmlService.createHtmlOutputFromFile(filename).getContent();
      cache.put(cacheKey, content, 21600); // 6 horas
      return content;
    } catch (e) {
      console.error(`[Main] Error en include(${filename}):`, e.message);
      return `<!-- Error: ${filename} no encontrado -->`;
    }
  }

  // Modo desarrollo: Lectura directa sin caché
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    return `<!-- Error: ${filename} no encontrado -->`;
  }
}

