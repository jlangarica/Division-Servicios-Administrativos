/**
 * Servicio para la generación de métricas y estadísticas del Panel de Control.
 */

/**
 * Calcula las métricas reales del dashboard consultando la Base de Datos y el Flujo.
 * @returns {Object} Estadísticas consolidadas.
 */
function getDashboardStats() {
  try {
    const ss = SpreadsheetApp.openById(SS_ADQUISICIONES_ID);
    const sheetBD = ss.getSheetByName(SHEETS.BASE_DATOS);
    const sheetFlujo = ss.getSheetByName(SHEETS.FLUJO);
    
    if (!sheetBD) return null;

    const dataBD = sheetBD.getDataRange().getValues();
    if (dataBD.length < 1) return null;

    const headersBD = dataBD[0];
    const colEstado = headersBD.findIndex(h => h.toString().toLowerCase().includes('estado') || h.toString().toLowerCase().includes('estat'));
    const finalColEstado = colEstado !== -1 ? colEstado : 9; // Fallback a columna 10
    
    const stats = {
      total: dataBD.length - 1,
      activas: 0,
      pendientesAprobacion: 0,
      finalizadas: 0,
      recentActivity: []
    };

    // Procesar Base de Datos para métricas de estado
    dataBD.slice(1).forEach(row => {
      const estado = row[finalColEstado];
      if (estado === 'FINALIZADO') {
        stats.finalizadas++;
      } else if (estado && estado.includes('RECHAZADO')) {
        // Rechazados no se cuentan como activos
      } else {
        stats.activas++;
        // Definición de "Pendiente": Etapas iniciales de revisión
        if (['S01_RECEPCION', 'S02_VALIDACION', 'S04_AUTORIZACION'].includes(estado)) {
          stats.pendientesAprobacion++;
        }
      }
    });

    // Procesar Historial de Flujo para Actividad Reciente
    if (sheetFlujo) {
      const lastRow = sheetFlujo.getLastRow();
      if (lastRow > 1) {
        // Leer las últimas 10 filas para asegurar que tenemos actividad fresca
        const startRow = Math.max(2, lastRow - 9);
        const historyData = sheetFlujo.getRange(startRow, 1, (lastRow - startRow) + 1, 7).getValues();
        
        stats.recentActivity = historyData.map(row => {
          // [uuid, timestamp, evento, estadoAnt, estadoNew, usuario, motivo]
          return {
            uuid: row[0],
            timestamp: row[1],
            evento: row[2],
            estadoAnterior: row[3],
            estadoNuevo: row[4],
            usuario: row[5],
            motivo: row[6]
          };
        }).reverse().slice(0, 5); // Tomar las 5 más recientes
      }
    }

    return stats;
  } catch (error) {
    console.error('[DashboardService] Error en getDashboardStats:', error);
    return null;
  }
}
