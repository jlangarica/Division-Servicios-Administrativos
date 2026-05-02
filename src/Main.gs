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
 *
 * @param {string} filename Ruta relativa al archivo sin extensión.
 * @returns {string} Contenido HTML del archivo.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
