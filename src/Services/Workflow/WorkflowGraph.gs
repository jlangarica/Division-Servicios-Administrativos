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
      // Requiere que el usuario sea DSA y que el oficio exista (se asume en ctx.documents o similar)
      return ctx.userRole === 'DSA' && ctx.documents && ctx.documents.includes('OFICIO_ESCANEADO');
    },
    requiresReason: false
  },
  
  // --- FASE 2: COTIZACIÓN ---
  {
    from: 'S02_VERIF_CATALOGO',
    to: 'S03_SOLICITUD_COTIZACION',
    event: 'ADVANCE',
    guard: function(ctx) {
      return ctx.userRole === 'DSA';
    },
    requiresReason: false
  },
  
  // --- FASE 8: PROVEEDOR COTIZA ---
  {
    from: 'S08_PROVEEDOR_COTIZA',
    to: 'S09_CUADRO_COMPARATIVO',
    event: 'ADVANCE',
    guard: function(ctx) {
      // Avanza a cuadro comparativo cuando hay al menos 3 cotizaciones
      return ctx.userRole === 'DSA' && (ctx.cotizacionesRecibidas || 0) >= 3;
    },
    requiresReason: false
  },
  
  // --- EJEMPLOS DE RECHAZO / EXCEPCIONES ---
  {
    from: 'S02_VERIF_CATALOGO',
    to: 'S99_RECHAZADO',
    event: 'REJECT',
    guard: function(ctx) {
      return ctx.userRole === 'DSA';
    },
    requiresReason: true
  }
  
  // Nota: Añadir más transiciones según las necesidades específicas del dominio.
];
