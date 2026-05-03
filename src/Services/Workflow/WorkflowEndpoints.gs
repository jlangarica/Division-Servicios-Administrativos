/**
 * Endpoints RPC para el Frontend relacionados con el Workflow FSM.
 * Funciones expuestas a google.script.run
 */

/**
 * Obtiene las acciones (eventos) disponibles para un folio específico
 * según el estado actual y el contexto del usuario en sesión.
 * 
 * @param {string} uuid_folio ID único del expediente.
 * @returns {Array<string>} Lista de eventos válidos (ej. ['ADVANCE', 'REJECT']).
 */
function getAvailableActionsEndpoint(uuid_folio) {
  try {
    // En un sistema real, extraeríamos el rol del usuario desde la sesión o caché
    // Aquí simulamos que el usuario tiene el rol 'DSA'
    const sessionContext = {
      userRole: 'DSA',
      userEmail: Session.getActiveUser().getEmail() || 'test@example.com'
    };

    return WorkflowEngine.getAvailableActions(uuid_folio, sessionContext);
  } catch (error) {
    console.error('[WorkflowEndpoints] Error en getAvailableActionsEndpoint:', error);
    return []; // Fallback seguro: no mostrar acciones
  }
}

/**
 * Despacha un evento desde el frontend para realizar una transición en el FSM.
 * 
 * @param {string} uuid_folio ID único del expediente.
 * @param {string} event Nombre del evento a despachar (ej. 'ADVANCE').
 * @param {Object} [payload={}] Datos adicionales para la transición (ej. { reason: 'No cumple requisitos' }).
 * @returns {Object} Respuesta estándar de la API { success, newState, error }.
 */
function dispatchWorkflowEventEndpoint(uuid_folio, event, payload = {}) {
  try {
    // Inyectar datos de sesión en el payload para auditoría
    payload.userEmail = Session.getActiveUser().getEmail() || 'test@example.com';

    return WorkflowRepository.dispatchEvent(uuid_folio, event, payload);
  } catch (error) {
    console.error('[WorkflowEndpoints] Error en dispatchWorkflowEventEndpoint:', error);
    return { success: false, error: 'Error del servidor al procesar la transición.' };
  }
}
