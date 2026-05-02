/**
 * Configuración global del sistema.
 * Centraliza constantes, IDs y enums compartidos.
 *
 * @fileoverview Single source of truth para configuración.
 * Cualquier cambio de entorno se realiza aquí.
 * @constant
 */

/** ID del Spreadsheet de configuración */
const SS_CONFIG_ID = '1BsQLunCnWlkRJZUOgXy3mBuRlQZ8EovR7vfN4E6zTHI';

/**
 * Nombres de las hojas de cálculo.
 * @enum {string}
 */
const SHEETS = Object.freeze({
  USUARIOS: 'Usuarios',
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
