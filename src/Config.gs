/**
 * Configuración global del sistema.
 * Centraliza constantes, IDs y enums compartidos.
 *
 * @fileoverview Single source of truth para configuración.
 * Los IDs sensibles se recuperan de PropertiesService.
 * @constant
 */

/** 
 * Clase de configuración estática para centralizar el acceso a propiedades.
 */
const CONFIG = (function() {
  const props = PropertiesService.getScriptProperties().getProperties();
  
  // Validación no-bloqueante de la API Key de Gemini
  if (!props.GEMINI_API_KEY) {
    console.warn('[Config] Falta GEMINI_API_KEY en ScriptProperties. El OCR con IA no funcionará.');
  }

  return {
    /** ID del Spreadsheet de configuración */
    SS_CONFIG_ID: props.SS_CONFIG_ID || '1BsQLunCnWlkRJZUOgXy3mBuRlQZ8EovR7vfN4E6zTHI',
    
    /** ID de la hoja de Adquisiciones/Base de Datos */
    SS_ADQUISICIONES_ID: props.SS_ADQUISICIONES_ID || '1sI_Yy5A7_HqSH1FY4ftg9EMs-jMw7HpQQFV4Ai7X6z8',
    
    /** ID de la carpeta raíz de expedientes en Drive */
    EXPEDIENTES_FOLDER_ID: props.EXPEDIENTES_FOLDER_ID || '1o5kw1wyPnOzQp8NypnReBHxzjeJEj34G',

    /** API Key de Google AI Studio (Gemini). Se lee exclusivamente de PropertiesService. */
    GEMINI_API_KEY: props.GEMINI_API_KEY || '',

    /** ID de carpeta temporal en Drive para buffer del Picker OCR (efímera — auto-purge). */
    OCR_BUFFER_FOLDER_ID: props.OCR_BUFFER_FOLDER_ID || '',

    /** API Key de navegador (GCP) para Google Picker. Restringida a *.googleusercontent.com */
    GOOGLE_DEV_KEY: props.GOOGLE_DEV_KEY || '',

    /** Número de Proyecto de Google Cloud (AppId). Requerido por la doc oficial. */
    GOOGLE_PROJECT_NUMBER: props.GOOGLE_PROJECT_NUMBER || ''
  };
})();

// Compatibilidad con código existente (Alias)
const SS_CONFIG_ID = CONFIG.SS_CONFIG_ID;
const SS_ADQUISICIONES_ID = CONFIG.SS_ADQUISICIONES_ID;

/**
 * Nombres de las hojas de cálculo.
 * @enum {string}
 */
const SHEETS = Object.freeze({
  USUARIOS: 'Usuarios',
  BASE_DATOS: 'Base de Datos',
  EXPEDIENTES: 'Expedientes',
  FLUJO: 'Flujo',
});

/** Configuración de Drive */
const DRIVE_CONFIG = Object.freeze({
  EXPEDIENTES_FOLDER_ID: CONFIG.EXPEDIENTES_FOLDER_ID,
});

/**
 * Duración de caché en segundos.
 * @enum {number}
 */
const CACHE_TTL = Object.freeze({
  USER_SESSION: 1800,   // 30 min
  LOOKUP_DATA: 3600,    // 1 h
});

/**
 * Configuración de la aplicación UI.
 * @enum {string}
 */
const APP_CONFIG = Object.freeze({
  TITLE: 'Sistema de Compras HCG',
  BRAND: 'DSA | Compras',
});

// Validación de carga (fail-fast)
if (!SS_CONFIG_ID || !SS_ADQUISICIONES_ID) {
  throw new Error('Faltan IDs de configuración crítica. Verifique PropertiesService o Config.gs');
}

