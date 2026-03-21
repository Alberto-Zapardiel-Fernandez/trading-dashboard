// src/services/indicadores.js
// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de indicadores técnicos a partir de datos OHLCV.
// Todo se calcula en el frontend a partir de los datos de Yahoo Finance.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula una Media Móvil Simple (SMA) sobre los precios de cierre.
 *
 * @param {Array} velas - Array de velas { time, close, ... }
 * @param {number} periodo - Número de velas a promediar (ej: 50, 200)
 * @returns {Array} [{ time, value }, ...] — solo desde que hay suficientes datos
 */
export function calcularSMA(velas, periodo) {
  const resultado = []

  for (let i = periodo - 1; i < velas.length; i++) {
    // Sumamos los últimos N cierres
    const suma = velas.slice(i - periodo + 1, i + 1).reduce((acc, v) => acc + v.close, 0)

    resultado.push({
      time: velas[i].time,
      value: suma / periodo
    })
  }

  return resultado
}

/**
 * Calcula el RSI (Relative Strength Index) con periodo 14 por defecto.
 * Valores > 70 = sobrecomprado, < 30 = sobrevendido.
 *
 * @param {Array} velas - Array de velas { time, close, ... }
 * @param {number} periodo - Periodo del RSI (defecto: 14)
 * @returns {Array} [{ time, value }, ...]
 */
export function calcularRSI(velas, periodo = 14) {
  const resultado = []
  if (velas.length < periodo + 1) return resultado

  // Calculamos los cambios entre cierres consecutivos
  const cambios = velas.slice(1).map((v, i) => v.close - velas[i].close)

  // Primera media de ganancias y pérdidas (periodo inicial)
  let mediaGanancia =
    cambios
      .slice(0, periodo)
      .filter(c => c > 0)
      .reduce((a, c) => a + c, 0) / periodo

  let mediaPerdida =
    cambios
      .slice(0, periodo)
      .filter(c => c < 0)
      .reduce((a, c) => a + Math.abs(c), 0) / periodo

  // Primera lectura del RSI
  const rs = mediaPerdida === 0 ? 100 : mediaGanancia / mediaPerdida
  resultado.push({ time: velas[periodo].time, value: 100 - 100 / (1 + rs) })

  // Resto de lecturas usando suavizado de Wilder
  for (let i = periodo; i < cambios.length; i++) {
    const cambio = cambios[i]
    const ganancia = cambio > 0 ? cambio : 0
    const perdida = cambio < 0 ? Math.abs(cambio) : 0

    mediaGanancia = (mediaGanancia * (periodo - 1) + ganancia) / periodo
    mediaPerdida = (mediaPerdida * (periodo - 1) + perdida) / periodo

    const rs = mediaPerdida === 0 ? 100 : mediaGanancia / mediaPerdida
    resultado.push({ time: velas[i + 1].time, value: 100 - 100 / (1 + rs) })
  }

  return resultado
}

/**
 * Calcula el MACD (Moving Average Convergence Divergence).
 * Configuración estándar: EMA12 - EMA26, señal EMA9.
 *
 * @param {Array} velas - Array de velas { time, close, ... }
 * @returns {{ macd: Array, signal: Array, histograma: Array }}
 */
export function calcularMACD(velas) {
  const ema12 = calcularEMA(velas, 12)
  const ema26 = calcularEMA(velas, 26)

  // La línea MACD solo existe donde hay EMA26 (la más lenta)
  // Buscamos el offset entre ema12 y ema26
  const offsetEma12 = velas.length - ema12.length
  const offsetEma26 = velas.length - ema26.length

  const lineaMacd = ema26.map((e26, i) => {
    const e12 = ema12[i + (offsetEma26 - offsetEma12)]
    return { time: e26.time, value: e12.value - e26.value }
  })

  // Línea de señal: EMA9 sobre la línea MACD
  const velasFicticias = lineaMacd.map(p => ({ time: p.time, close: p.value }))
  const signal = calcularEMA(velasFicticias, 9)

  // Histograma: MACD - señal
  const offsetSignal = lineaMacd.length - signal.length
  const histograma = signal.map((s, i) => {
    const m = lineaMacd[i + offsetSignal]
    return { time: s.time, value: m.value - s.value }
  })

  return { macd: lineaMacd, signal, histograma }
}

/**
 * Calcula una Media Móvil Exponencial (EMA).
 * Función auxiliar usada internamente por calcularMACD.
 *
 * @param {Array} velas - Array de velas o puntos { time, close/value }
 * @param {number} periodo
 * @returns {Array} [{ time, value }, ...]
 */
export function calcularEMA(velas, periodo) {
  const resultado = []
  if (velas.length < periodo) return resultado

  const k = 2 / (periodo + 1) // Factor de suavizado

  // Primera EMA = SMA del primer bloque
  const primerSMA = velas.slice(0, periodo).reduce((acc, v) => acc + (v.close ?? v.value), 0) / periodo

  resultado.push({ time: velas[periodo - 1].time, value: primerSMA })

  // Resto: EMA = precio * k + EMA_anterior * (1 - k)
  for (let i = periodo; i < velas.length; i++) {
    const precio = velas[i].close ?? velas[i].value
    const emaAnterior = resultado[resultado.length - 1].value
    resultado.push({ time: velas[i].time, value: precio * k + emaAnterior * (1 - k) })
  }

  return resultado
}
