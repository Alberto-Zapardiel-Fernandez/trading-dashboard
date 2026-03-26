// ─────────────────────────────────────────────────────────────────────────────
// constants.js — Constantes globales de la aplicación
// ─────────────────────────────────────────────────────────────────────────────

// Porcentaje de riesgo por operación (1% del saldo realizado)
export const RIESGO_PORCENTAJE = 0.01

// Nombres de las colecciones en Firestore
export const COLECCIONES = {
  OPERACIONES: 'operaciones',
  DCA: 'dca',
  CONFIG: 'config',
  MOVIMIENTOS: 'movimientos',
  RADAR: 'radar'
}

// ── Cuentas disponibles ───────────────────────────────────────────────────────
// TRADING  → cuenta activa de operativa a corto/medio plazo
// BUNKER   → cuenta de ahorro/largo plazo donde entran las mensualidades
export const CUENTAS = {
  TRADING: 'TRADING',
  BUNKER: 'BUNKER'
}

// Etiquetas y colores para mostrar cada cuenta en la UI
export const INFO_CUENTA = {
  TRADING: { label: 'Trading', color: 'text-blue-400', fondo: 'bg-blue-900/30', borde: 'border-blue-800' },
  BUNKER: { label: 'Bunker', color: 'text-amber-400', fondo: 'bg-amber-900/30', borde: 'border-amber-800' }
}

// ── Tipos de movimiento ───────────────────────────────────────────────────────
// Los nuevos tipos de traspaso y retirada bancaria se añaden sin romper
// los datos ya guardados (DEPOSITO, RETIRADA, INTERES, DIVIDENDO, AJUSTE)
export const TIPO_MOVIMIENTO = {
  // Tipos originales — siguen funcionando igual
  DEPOSITO: 'DEPOSITO',
  RETIRADA: 'RETIRADA',
  INTERES: 'INTERES',
  DIVIDENDO: 'DIVIDENDO',
  AJUSTE: 'AJUSTE',

  // ── Nuevos tipos multicuenta ──
  // Traspaso de Bunker → Trading (sale de Bunker, entra en Trading)
  TRASPASO_A_TRADING: 'TRASPASO_A_TRADING',
  // Traspaso de Trading → Bunker (sale de Trading, entra en Bunker)
  TRASPASO_A_BUNKER: 'TRASPASO_A_BUNKER',
  // Retirada real de dinero al banco personal (sale de cualquier cuenta)
  RETIRADA_BANCO: 'RETIRADA_BANCO'
}

// ── Metadatos visuales de cada tipo de movimiento ────────────────────────────
// Usados en Movimientos.jsx para colores, etiquetas y signo (+/-)
export const INFO_TIPO_MOVIMIENTO = {
  DEPOSITO: { label: 'Depósito', texto: 'text-green-400', fondo: 'bg-green-900/30', signo: +1 },
  RETIRADA: { label: 'Retirada', texto: 'text-red-400', fondo: 'bg-red-900/30', signo: -1 },
  INTERES: { label: 'Interés', texto: 'text-blue-400', fondo: 'bg-blue-900/30', signo: +1 },
  DIVIDENDO: { label: 'Dividendo', texto: 'text-purple-400', fondo: 'bg-purple-900/30', signo: +1 },
  AJUSTE: { label: 'Ajuste', texto: 'text-yellow-400', fondo: 'bg-yellow-900/30', signo: +1 },
  TRASPASO_A_TRADING: { label: '→ Trading', texto: 'text-blue-300', fondo: 'bg-blue-900/20', signo: 0 },
  TRASPASO_A_BUNKER: { label: '→ Bunker', texto: 'text-amber-300', fondo: 'bg-amber-900/20', signo: 0 },
  RETIRADA_BANCO: { label: 'Retirada al banco', texto: 'text-rose-400', fondo: 'bg-rose-900/30', signo: -1 }
}
