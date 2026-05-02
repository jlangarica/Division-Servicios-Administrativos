/**
 * Manejador principal para peticiones GET.
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('src/ui/Index')
    .evaluate()
    .setTitle('Sistema de Compras HCG')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Incluye el contenido de un archivo HTML en el template actual.
 * @param {string} filename Nombre del archivo a incluir.
 * @returns {string} Contenido del archivo.
 */
function include(filename: string) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
