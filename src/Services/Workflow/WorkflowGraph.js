/**
 * Grafo de transiciones del sistema.
 * 
 * Implementa un modelo de máquina de estados finitos (FSM) simplificado.
 * Define las reglas algebraicas para avanzar entre los estados del workflow
 * de adquisiciones.
 * 
 * @type {Array<Object>}
 */
const WORKFLOW_GRAPH = [
  // --- FASE 1: RECEPCIÓN Y VERIFICACIÓN ---
  {
    from: 'S01_RECEPCION',
    to: 'S02_VERIF_CATALOGO',
    event: 'ADVANCE',
    guard: function(ctx) {
      // ELIMINADO: Validación de rol y documentos
      return true;
    },
    requiresReason: false
  },
  
  // --- FASE 2: COTIZACIÓN ---
  {
    from: 'S02_VERIF_CATALOGO',
    to: 'S03_SOLICITUD_COTIZACION',
    event: 'ADVANCE',
    guard: function(ctx) {
      return true;
    },
    requiresReason: false
  },
  
  // --- FASE 8: PROVEEDOR COTIZA ---
  {
    from: 'S08_PROVEEDOR_COTIZA',
    to: 'S09_CUADRO_COMPARATIVO',
    event: 'ADVANCE',
    guard: function(ctx) {
      // ELIMINADO: Validación de cuórum de cotizaciones
      return true;
    },
    requiresReason: false
  },
  
  // --- EJEMPLOS DE RECHAZO / EXCEPCIONES ---
  {
    from: 'S02_VERIF_CATALOGO',
    to: 'S99_RECHAZADO',
    event: 'REJECT',
    guard: function(ctx) {
      return true;
    },
    requiresReason: true
  }
];
