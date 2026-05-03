/**
 * Servicio para la generación de métricas y estadísticas del Panel de Control.
 */

/**
 * Calcula las métricas reales del dashboard consultando la Base de Datos y el Flujo.
 * Implementa caché para evitar recalcular en ráfagas de recarga.
 * 
 * @returns {Object} Estadísticas consolidadas.
 */
function getDashboardStats() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'dashboard_stats_v1';
  const cached = cache.get(cacheKey);
  
  if (cached) return JSON.parse(cached);

  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheetBD = ss.getSheetByName(SHEETS.BASE_DATOS);
    const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
    
    if (!sheetBD) return null;

    // Solo leemos las columnas necesarias para métricas (ID y Estado)
    const lastRow = sheetBD.getLastRow();
    if (lastRow < 2) return { total: 0, activas: 0, pendientesAprobacion: 0, finalizadas: 0, recentActivity: [] };

    const dataBD = sheetBD.getDataRange().getValues();
    const headers = dataBD[0].map(h => String(h).toLowerCase());
    const colEstado = headers.findIndex(h => h.includes('estado') || h.includes('estatus'));
    
    const stats = {
      total: lastRow - 1,
      activas: 0,
      pendientesAprobacion: 0,
      finalizadas: 0,
      recentActivity: []
    };

    dataBD.slice(1).forEach(row => {
      const estado = colEstado !== -1 ? row[colEstado] : 'S01_RECEPCION';
      if (estado === 'FINALIZADO') {
        stats.finalizadas++;
      } else if (estado?.includes('RECHAZADO')) {
        // No contados como activos
      } else {
        stats.activas++;
        if (['S01_RECEPCION', 'S02_VALIDACION', 'S04_AUTORIZACION'].includes(estado)) {
          stats.pendientesAprobacion++;
        }
      }
    });

    // Actividad Reciente (Flujo)
    if (sheetFlujo) {
      const lastRowFlujo = sheetFlujo.getLastRow();
      if (lastRowFlujo > 1) {
        const startRow = Math.max(2, lastRowFlujo - 10);
        const historyData = sheetFlujo.getRange(startRow, 1, (lastRowFlujo - startRow) + 1, 7).getValues();
        
        stats.recentActivity = historyData.map(row => ({
          uuid: row[0],
          timestamp: row[1],
          evento: row[2],
          estadoAnterior: row[3],
          estadoNuevo: row[4],
          usuario: row[5],
          motivo: row[6]
        })).reverse().slice(0, 5);
      }
    }

    // Cachear por 2 minutos
    cache.put(cacheKey, JSON.stringify(stats), 120);

    return stats;
  } catch (error) {
    console.error('[DashboardService] Error:', error);
    return null;
  }
}

