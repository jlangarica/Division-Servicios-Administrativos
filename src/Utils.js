/**
 * @fileoverview Utilidades globales.
 */

/**
 * Genera un identificador único universal (UUID v4).
 * Usado para vinculación de base de datos en los expedientes digitales.
 * @returns {string} UUID
 */
function generateUUID() {
  return Utilities.getUuid();
}

/**
 * Sanitizador de montos monetarios.
 * Elimina comas (ej. 169,500.00) y símbolos de moneda antes de cálculos numéricos
 * para evitar NaN en el sistema.
 * @param {string|number} value 
 * @returns {number}
 */
function sanitizeAmount(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  // Limpia el string de símbolos de moneda y espacios
  let str = String(value).replace(/[\$\s]/g, '');
  // Elimina las comas de miles (suponiendo formato 1,000.50)
  str = str.replace(/,/g, '');
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}
