export const RIESGO_PORCENTAJE = 0.01

export const COLECCIONES = {
  OPERACIONES: 'operaciones',
  DCA: 'dca',
  CONFIG: 'config',
  MOVIMIENTOS: 'movimientos' // ingresos, retiradas, intereses
}

// Tipos de movimiento en el libro de caja
export const TIPO_MOVIMIENTO = {
  DEPOSITO: 'DEPOSITO',
  RETIRADA: 'RETIRADA',
  INTERES: 'INTERES',
  DIVIDENDO: 'DIVIDENDO',
  AJUSTE: 'AJUSTE' // para cuadrar manualmente si hace falta
}
