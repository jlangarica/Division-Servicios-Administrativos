/**
 * Servicio de integración con Supabase (PostgREST) para consultas
 * de historial de compras institucional.
 *
 * @fileoverview Puente HTTP hacia la Base de Datos Histórica alojada en Supabase.
 * Utiliza UrlFetchApp con autenticación Bearer + apikey header.
 * Los secretos se leen de PropertiesService vía CONFIG.
 *
 * CORRECCIONES v2:
 *  - BUG #3 FIX: Valores del filtro `in()` ahora van entre comillas dobles
 *    para columnas de tipo TEXT en PostgREST.
 *  - BUG #4 FIX: Agregado header 'Prefer: count=none' para evitar COUNT(*)
 *    implícito y reducir latencia.
 *  - MEJORA: Guard de trailing slash en SUPABASE_URL.
 */

const SupabaseService = (() => {
  /** Nombre de la tabla en Supabase (schema público) */
  const TABLE_NAME = 'Historico';

  /**
   * Valida que las credenciales de Supabase estén configuradas.
   * @returns {boolean} true si ambas credenciales existen.
   */
  function isConfigured() {
    return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
  }

  /**
   * Construye los headers estándar de autenticación para PostgREST.
   * Incluye 'Prefer: count=none' para deshabilitar el COUNT(*) implícito
   * y reducir la latencia de cada petición.
   *
   * @returns {Object} Headers HTTP para UrlFetchApp.
   */
  function buildHeaders() {
    return {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      // FIX BUG #4: Evita el COUNT(*) implícito de PostgREST en cada request.
      // Sin este header, Supabase ejecuta una query de conteo adicional que
      // incrementa la latencia y puede causar timeouts en Apps Script.
      'Prefer': 'count=none'
    };
  }

  /**
   * Devuelve la URL base de Supabase sin trailing slash.
   * Guard necesario porque si el usuario configura la URL con "/" al final,
   * la URL resultante quedaría como ".../rest/v1//Historico" (doble slash),
   * lo que genera un error 404 en PostgREST.
   *
   * @returns {string} URL base normalizada.
   */
  function getBaseUrl() {
    // FIX: Eliminar trailing slash para evitar doble slash en la URL final.
    return (CONFIG.SUPABASE_URL || '').replace(/\/$/, '');
  }

  /**
   * Consulta el historial de compras dado un array de códigos de artículos.
   * Utiliza el operador `in` de PostgREST para filtrar múltiples valores
   * en una sola petición HTTP, minimizando el consumo de cuotas.
   *
   * CORRECCIÓN CRÍTICA (BUG #3):
   * La columna `mov_art_codigo` es de tipo TEXT en Supabase. El operador
   * `in` de PostgREST requiere que los valores de texto estén entre comillas
   * dobles dentro del paréntesis para ser tratados correctamente como strings.
   *
   *   ❌ ANTES (incorrecto para TEXT): ?mov_art_codigo=in.(6010,6011)
   *   ✅ AHORA (correcto para TEXT):  ?mov_art_codigo=in.("6010","6011")
   *
   * Sin las comillas, PostgREST puede intentar castear los valores a un tipo
   * numérico o interpretarlos ambiguamente, devolviendo 0 resultados para
   * códigos que en la DB están almacenados como cadenas de texto.
   *
   * @param {Array<string>} codigos - Lista de mov_art_codigo (strings, tal como
   *   vienen del OCR, sin mutación de caracteres).
   * @returns {Array<Object>} Registros del historial de compras o array vacío.
   */
  function getHistorialPorCodigos(codigos) {
    if (!codigos || codigos.length === 0) return [];

    if (!isConfigured()) {
      console.warn('[Supabase] Credenciales no configuradas. Omitiendo consulta de historial.');
      return [];
    }

    // FIX BUG #3: Encerrar cada código en comillas dobles.
    // Esto es obligatorio para columnas de tipo TEXT en PostgREST:
    //   in.("val1","val2") → interpreta como TEXT
    //   in.(val1,val2)     → comportamiento ambiguo, falla con puntos/guiones
    const codigosString = codigos.map(c => `"${c}"`).join(',');

    const url = `${getBaseUrl()}/rest/v1/${TABLE_NAME}?select=*&mov_art_codigo=in.(${codigosString})`;

    const options = {
      method: 'get',
      headers: buildHeaders(),
      muteHttpExceptions: true
    };

    console.log('[Supabase] URL de consulta:', url);

    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();

      if (statusCode === 200) {
        const data = JSON.parse(response.getContentText());
        console.log(`[Supabase] Consulta exitosa: ${data.length} registros para ${codigos.length} códigos.`);
        return data;
      }

      // Log del cuerpo del error para diagnóstico rápido en stackdriver
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