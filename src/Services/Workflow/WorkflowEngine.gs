/**
 * Motor de Workflow Estático (FSM)
 * 
 * Implementación funcional (Stateless) de la máquina de estados.
 * Las reglas están separadas de los efectos secundarios (Side Effects).
 */
const WorkflowEngine = {

  /**
   * Evalúa si una transición es válida dados el estado actual, el evento y el contexto.
   * Función Pura: No interactúa con Google Sheets ni Google Drive.
   * 
   * @param {string} currentState El estado actual del folio (ej. 'S01_RECEPCION').
   * @param {string} event El evento disparado (ej. 'ADVANCE', 'REJECT').
   * @param {Object} context El objeto TransitionContext (hidratado por ContextManager).
   * @param {Object} [payload={}] Datos adicionales enviados por el usuario.
   * @returns {Object} {ok: boolean, error: string|null, nextState: string|null, requiresReason: boolean}
   */
  evaluateTransition: function(currentState, event, context, payload = {}) {
    // 1. Buscar la transición en el grafo
    const transition = WORKFLOW_GRAPH.find(t => 
      t.from === currentState && t.event === event
    );

    if (!transition) {
      return { 
        ok: false, 
        error: `Transición no definida desde [${currentState}] con evento [${event}].` 
      };
    }

    // 2. Validar Guardas (Predicados algebraicos)
    try {
      const guardResult = transition.guard(context);
      if (!guardResult) {
        return { 
          ok: false, 
          error: "No se cumplen las condiciones o privilegios para esta transición." 
        };
      }
    } catch (e) {
      console.error('[WorkflowEngine] Error evaluando guarda:', e);
      return { 
        ok: false, 
        error: "Error interno al evaluar las reglas de negocio." 
      };
    }

    // 3. Validar si requiere razón y no se proporcionó
    if (transition.requiresReason && (!payload.reason || payload.reason.trim() === '')) {
      return { 
        ok: false, 
        error: "Esta acción requiere un motivo o justificación (reason)." 
      };
    }

    return { 
      ok: true, 
      error: null, 
      nextState: transition.to,
      requiresReason: transition.requiresReason 
    };
  },

  /**
   * Obtiene los eventos válidos (botones a mostrar en la UI) 
   * según el estado actual y el contexto.
   * 
   * @param {string} uuid_folio El ID del expediente.
   * @param {Object} [sessionContext={}] Contexto adicional de la sesión del usuario.
   * @returns {Array<string>} Lista de eventos válidos.
   */
  getAvailableActions: function(uuid_folio, sessionContext = {}) {
    // 1. Hidratar el contexto (puede usar caché internamente)
    // Se invoca dinámicamente a ContextManager
    const context = ContextManager.buildContext(uuid_folio);
    
    // Unir contexto de dominio con contexto de sesión (ej. userRole inyectado desde la sesión)
    const evalContext = { ...context, ...sessionContext };

    // 2. Filtrar transiciones posibles desde el estado actual
    const possibleTransitions = WORKFLOW_GRAPH.filter(t => t.from === evalContext.estado_actual);

    // 3. Ejecutar guardas
    const validEvents = [];
    for (const transition of possibleTransitions) {
      try {
        if (transition.guard(evalContext)) {
          validEvents.push(transition.event);
        }
      } catch (e) {
        // Ignorar transiciones donde la guarda falle lanzando excepción
      }
    }

    return validEvents;
  }
};
