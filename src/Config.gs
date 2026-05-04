/**
 * Configuración global del sistema.
 *
 * CORRECCIÓN v2:
 *  - BUG-12 FIX: Eliminados los IDs de Spreadsheet y carpeta de Drive hardcodeados
 *    como valores fallback. Tener IDs de recursos de producción en el código fuente
 *    expone los activos institucionales a cualquier persona con acceso al repositorio.
 *    Ahora todos los IDs críticos DEBEN estar en PropertiesService. Si falta alguno,
 *    la validación fail-fast al final del archivo lanza un error claro.
 */

const CONFIG = (function() {
  const props = PropertiesService.getScriptProperties().getProperties();

  // Validaciones no-bloqueantes de APIs opcionales
  if (!props.GEMINI_API_KEY) {
    console.warn('[Config] Falta GEMINI_API_KEY en ScriptProperties. El OCR con IA no funcionará.');
  }
  if (!props.SUPABASE_URL || !props.SUPABASE_KEY) {
    console.warn('[Config] Faltan SUPABASE_URL / SUPABASE_KEY. El historial de proveedores no funcionará.');
  }

  return {
    // FIX BUG-12: IDs críticos SIN fallback hardcodeado.
    // Si no están en PropertiesService, retornan undefined y la validación
    // final lanza un error con mensaje claro (fail-fast).
    // Configurar en: Extensiones → Apps Script → Configuración del proyecto → Propiedades de script
    SS_CONFIG_ID:           props.SS_CONFIG_ID,
    SS_ADQUISICIONES_ID:    props.SS_ADQUISICIONES_ID,
    EXPEDIENTES_FOLDER_ID:  props.EXPEDIENTES_FOLDER_ID,

    // APIs opcionales — sin fallback tampoco, pero sus advertencias ya están arriba
    GEMINI_API_KEY:         props.GEMINI_API_KEY    || '',
    OCR_BUFFER_FOLDER_ID:   props.OCR_BUFFER_FOLDER_ID || '',
    GOOGLE_DEV_KEY:         props.GOOGLE_DEV_KEY    || '',
    GOOGLE_PROJECT_NUMBER:  props.GOOGLE_PROJECT_NUMBER || '',
    SUPABASE_URL:           props.SUPABASE_URL       || '',
    SUPABASE_KEY:           props.SUPABASE_KEY       || '',
  };
})();

// Alias de compatibilidad
const SS_CONFIG_ID        = CONFIG.SS_CONFIG_ID;
const SS_ADQUISICIONES_ID = CONFIG.SS_ADQUISICIONES_ID;

/** @enum {string} */
const SHEETS = Object.freeze({
  USUARIOS:   'Usuarios',
  BASE_DATOS: 'Base de Datos',
  EXPEDIENTES:'Expedientes',
  BIENES:     'Detalles',
  FLUJO:      'Flujo',
});

const DRIVE_CONFIG = Object.freeze({
  EXPEDIENTES_FOLDER_ID: CONFIG.EXPEDIENTES_FOLDER_ID,
});

/** @enum {number} */
const CACHE_TTL = Object.freeze({
  USER_SESSION: 1800,
  LOOKUP_DATA:  3600,
});

/** @enum {string} */
const APP_CONFIG = Object.freeze({
  TITLE: 'Sistema de Compras HCG',
  BRAND: 'DSA | Compras',
});

// Validación fail-fast de IDs críticos
// Mensaje claro indica exactamente qué configurar y dónde.
if (!SS_CONFIG_ID || !SS_ADQUISICIONES_ID || !CONFIG.EXPEDIENTES_FOLDER_ID) {
  throw new Error(
    '[Config] Faltan IDs críticos en PropertiesService. ' +
    'Configure SS_CONFIG_ID, SS_ADQUISICIONES_ID y EXPEDIENTES_FOLDER_ID en: ' +
    'Extensiones → Apps Script → Configuración del proyecto → Propiedades de script.'
  );
}
