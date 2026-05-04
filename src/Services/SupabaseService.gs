/**
 * Servicio de integración con Supabase (PostgREST) para consultas
 * de historial de compras institucional.
 *
 * @fileoverview Puente HTTP hacia la Base de Datos Histórica alojada en Supabase.
 * Utiliza UrlFetchApp con autenticación Bearer + apikey header.
 * Los secretos se leen de PropertiesService vía CONFIG.
 */

const SupabaseService = (() => {
  /** Nombre de la tabla en Supabase (schema público) */
  const TABLE_NAME = 'historial_compras';

  /**
   * Valida que las credenciales de Supabase estén configuradas.
   * @returns {boolean} true si ambas credenciales existen.
   */
  function isConfigured() {
    return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
  }

  /**
   * Construye los headers estándar de autenticación para PostgREST.
   * @returns {Object} Headers HTTP para UrlFetchApp.
   */
  function buildHeaders() {
    return {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Consulta el historial de compras dado un array de códigos de artículos.
   * Utiliza el operador `in` de PostgREST para filtrar múltiples valores
   * en una sola petición HTTP, minimizando el consumo de cuotas.
   *
   * @param {Array<number>} codigos - Lista de mov_art_codigo (enteros).
   * @returns {Array<Object>} Registros del historial de compras o array vacío.
   */
  function getHistorialPorCodigos(codigos) {
    if (!codigos || codigos.length === 0) return [];

    if (!isConfigured()) {
      console.warn('[Supabase] Credenciales no configuradas. Omitiendo consulta de historial.');
      return [];
    }

    const codigosString = codigos.join(',');
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*&mov_art_codigo=in.(${codigosString})`;

    const options = {
      method: 'get',
      headers: buildHeaders(),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();

      if (statusCode === 200) {
        const data = JSON.parse(response.getContentText());
        console.log(`[Supabase] Consulta exitosa: ${data.length} registros para ${codigos.length} códigos.`);
        return data;
      }

      console.error(`[Supabase] HTTP ${statusCode}:`, response.getContentText());
      return [];
    } catch (e) {
      console.error('[Supabase] Fallo de red HTTP:', e.message);
      return [];
    }
  }

  return {
    isConfigured,
    getHistorialPorCodigos
  };
})();
