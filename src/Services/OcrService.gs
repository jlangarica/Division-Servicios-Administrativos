/**
 * Servicio de Extracción de Datos mediante Generative AI (Gemini).
 *
 * @fileoverview Orquesta la comunicación con la API REST de Gemini para
 * realizar OCR inteligente y estructuración de datos sobre expedientes
 * del HCG. Implementa tolerancia a fallos, limpieza de bloques Markdown
 * y normalización de tablas basada en auditoría documental.
 */
const OcrService = (() => {

  /** @const {string} Modelo optimizado para extracción de datos (Gemini 3 Flash) */
  const MODEL_ID = 'gemini-3-flash';

  /** @const {string} Base URL del endpoint REST de Gemini */
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  // ────────────────────────────────────────────────────────
  //  PROMPT  — Reglas de Oro del Auditor Documental HCG
  // ────────────────────────────────────────────────────────
  const SYSTEM_PROMPT = `
Actúa como un Auditor de Gestión Documental del HCG. Analiza el PDF adjunto y extrae
toda la información aplicando las siguientes REGLAS DE ORO con precisión quirúrgica:

1. CLASIFICACIÓN:
   - Detecta si el documento contiene la hoja oficial de "NEGATIVA DE INSUMO"
     y la frase "no cuenta unidades disponibles". Si cumple → es_negativa = true.

2. FOLIOS:
   - El folio de solicitud (Pág 1) es complejo (ej. AAQX04/15/01/2026).
   - El folio de negativa (Pág 2) es corto (ej. 64/2026).

3. SELLO AZUL (DSA):
   - Busca el recuadro con estrellas ★. El 'folio_sello_recepcion' es el número
     de 4 dígitos. NO tiene ":" (si tiene ":", es la hora y DEBE ignorarse).

4. FECHAS:
   - Formatea TODAS las fechas a YYYY-MM-DD estrictamente.
   - Prioriza la fecha del sello para recepción.
   - Extrae la fecha de elaboración (oficio).
   - Extrae la fecha/hora de emisión del sistema (pie de la negativa).

5. TABLAS:
   - Unifica las columnas 'Descripción/Insumo' y 'Cantidad/Requerida'.
   - Separa estrictamente el número del texto en 'cantidad_solicitada'.
     Si el documento dice "140 litros", extrae "140" en cantidad y "LITRO"
     en unidad_medida.

6. AUTOCORRECCIÓN:
   - Corrige errores comunes de OCR: "UTRO" → "LITRO", "PZ" → "PIEZA".
   - Si la descripción abarca varias líneas sin nuevo código numérico,
     únelas en un solo string hasta encontrar el siguiente código.
   - Prioriza siempre la descripción del Oficio original.
`.trim();

  // ────────────────────────────────────────────────────────
  //  SCHEMA  — Respuesta JSON estructurada
  // ────────────────────────────────────────────────────────
  const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      es_negativa: {
        type: 'boolean',
        description: 'True si existe la hoja oficial de Negativa de Insumo'
      },
      numero_oficio_solicitud: {
        type: 'string',
        description: 'Folio complejo de la solicitud (Pág 1)'
      },
      numero_negativa: {
        type: 'string',
        nullable: true,
        description: 'Folio corto XX/YYYY de la negativa (Pág 2)'
      },
      folio_sello_recepcion: {
        type: 'string',
        nullable: true,
        description: '4 dígitos dentro del sello azul ★'
      },
      codigo_uc: {
        type: 'string',
        nullable: true,
        description: 'Número de 4 dígitos después de U.C.'
      },
      servicio_solicitante: {
        type: 'string',
        nullable: true
      },
      fecha_elaboracion: {
        type: 'string',
        nullable: true,
        description: 'Fecha redactada en el oficio (YYYY-MM-DD)'
      },
      fecha_sello_recepcion: {
        type: 'string',
        nullable: true,
        description: 'Fecha dentro del sello azul (YYYY-MM-DD)'
      },
      fecha_hora_negativa: {
        type: 'string',
        nullable: true,
        description: 'Fecha y hora exacta del pie de la negativa'
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            codigo_insumo:       { type: 'string' },
            partida:             { type: 'string', nullable: true, description: 'Columna PARTIDA (ej. 2161)' },
            clave_catalogo:      { type: 'string', nullable: true, description: 'Código XXX.XXX.XXXX' },
            descripcion:         { type: 'string', description: 'Texto completo y unificado del bien' },
            cantidad_solicitada: { type: 'string', description: 'Cantidad numérica pura (sin unidad)' },
            unidad_medida:       { type: 'string', nullable: true, description: 'U.M. corregida (ej. LITRO, PIEZA)' }
          },
          required: ['codigo_insumo', 'descripcion', 'cantidad_solicitada']
        }
      }
    },
    required: ['es_negativa', 'numero_oficio_solicitud', 'items']
  };

  // ────────────────────────────────────────────────────────
  //  SANITIZACIÓN — Limpieza de bloques Markdown
  // ────────────────────────────────────────────────────────

  /**
   * Limpia la respuesta cruda de Gemini eliminando envolturas de código
   * Markdown que la IA pueda inyectar (`\`\`\`json ... \`\`\``).
   *
   * @param {string} raw Texto crudo de la respuesta.
   * @returns {string} JSON limpio listo para parsear.
   */
  function sanitizeJsonResponse(raw) {
    if (!raw || typeof raw !== 'string') return '{}';

    let cleaned = raw.trim();

    // Caso 1: Bloque ```json ... ``` completo
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');

    // Caso 2: Caracteres BOM o de control invisibles
    cleaned = cleaned.replace(/^\uFEFF/, '');

    return cleaned.trim();
  }

  // ────────────────────────────────────────────────────────
  //  MÉTODO PRINCIPAL
  // ────────────────────────────────────────────────────────

  /**
   * Analiza un documento PDF y extrae información estructurada
   * mediante la API REST de Gemini (Google AI Studio).
   *
   * @param {string} base64Data Archivo PDF codificado en Base64.
   * @param {string} mimeType Tipo MIME (normalmente 'application/pdf').
   * @returns {Object} Datos extraídos según el esquema definido.
   * @throws {Error} Si la API Key no está configurada o la API falla.
   */
  function analyzeDocumentWithGemini(base64Data, mimeType) {
    // 1. API Key — lectura segura desde PropertiesService
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY no configurada en las propiedades del script.');
    }

    const apiUrl = `${API_BASE}/${MODEL_ID}:generateContent?key=${apiKey}`;

    // 2. Construcción del Payload
    const payload = {
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { inlineData: { mimeType: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: RESPONSE_SCHEMA,
        temperature: 0.1 // Baja temperatura → máxima precisión
      }
    };

    // 3. Ejecución HTTP
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    console.log('[OcrService] Enviando PDF a Gemini (%s bytes base64)...', base64Data.length);
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    // 4. Manejo de errores HTTP
    if (responseCode !== 200) {
      let errorMessage = `Error Gemini API (${responseCode})`;
      try {
        const errorObj = JSON.parse(responseBody);
        errorMessage += ': ' + (errorObj.error?.message || 'Error desconocido');
      } catch (_) {
        errorMessage += ': ' + responseBody.substring(0, 200);
      }
      console.error('[OcrService]', errorMessage);
      throw new Error(errorMessage);
    }

    // 5. Extracción del texto de respuesta
    const result = JSON.parse(responseBody);
    const candidates = result?.candidates;

    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini no devolvió candidatos. Posible bloqueo de contenido.');
    }

    const textResponse = candidates[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error('Respuesta de Gemini vacía o sin texto procesable.');
    }

    // 6. Limpieza de seguridad y parseo
    const cleanJson = sanitizeJsonResponse(textResponse);

    try {
      const parsed = JSON.parse(cleanJson);
      console.log('[OcrService] Extracción exitosa — es_negativa: %s, items: %s',
        parsed.es_negativa, parsed.items?.length || 0);
      return parsed;
    } catch (parseError) {
      console.error('[OcrService] JSON inválido después de limpieza:', cleanJson.substring(0, 300));
      throw new Error('La respuesta de Gemini no es un JSON válido tras sanitización.');
    }
  }

  // ────────────────────────────────────────────────────────
  //  API PÚBLICA
  // ────────────────────────────────────────────────────────
  return {
    analyzeDocumentWithGemini
  };

})();
