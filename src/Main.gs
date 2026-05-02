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
 * Patron: server-side include para modularizar vistas.
 * Implementa caché en memoria del script para reducir latencia.
 *
 * @param {string} filename Ruta relativa al archivo sin extensión.
 * @returns {string} Contenido HTML del archivo.
 */
function include(filename) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'html_partial_' + filename;
  let content = cache.get(cacheKey);

  if (!content) {
    content = HtmlService.createHtmlOutputFromFile(filename).getContent();
    // Caché de 6 horas (21600s) — el contenido HTML es estático entre despliegues
    cache.put(cacheKey, content, 21600);
  }

  return content;
}
