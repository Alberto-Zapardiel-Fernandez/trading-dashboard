// src/services/yahooFinance.js

const CORS_PROXY = 'https://corsproxy.io/?url='
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/'

export async function obtenerPrecio(ticker) {
  try {
    const yahooUrl = `${YAHOO_BASE}${ticker}?interval=1m&range=1d`
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`
    const respuesta = await fetch(proxyUrl)
    if (!respuesta.ok) {
      console.warn(`[Yahoo] Error HTTP ${respuesta.status} para ${ticker}`)
      return null
    }
    const yahoo = await respuesta.json()
    const precio = yahoo?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (precio === undefined) {
      console.warn(`[Yahoo] No se encontró precio para ${ticker}`)
      return null
    }
    return precio
  } catch (error) {
    console.error(`[Yahoo] Error obteniendo precio de ${ticker}:`, error)
    return null
  }
}

export async function obtenerEurUsd() {
  return obtenerPrecio('EURUSD=X')
}

export async function obtenerPrecios(tickers) {
  const resultados = await Promise.allSettled(tickers.map(ticker => obtenerPrecio(ticker)))
  return tickers.reduce((acumulador, ticker, indice) => {
    const resultado = resultados[indice]
    acumulador[ticker] = resultado.status === 'fulfilled' ? resultado.value : null
    return acumulador
  }, {})
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 3: Datos OHLCV para gráfica de velas
// ─────────────────────────────────────────────────────────────────────────────

const TEMPORALIDADES = {
  '1m': { interval: '1m', range: '5d' },
  '15m': { interval: '15m', range: '60d' },
  '1h': { interval: '60m', range: '6mo' },
  '4h': { interval: '60m', range: '1y' },
  '1D': { interval: '1d', range: '2y' },
  '1S': { interval: '1d', range: '4y' },
  '1M': { interval: '1wk', range: '10y' }
}

export async function obtenerVelas(ticker, temporalidad = '1D') {
  try {
    const { interval, range } = TEMPORALIDADES[temporalidad] ?? TEMPORALIDADES['1D']
    const yahooUrl = `${YAHOO_BASE}${ticker}?interval=${interval}&range=${range}`
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`

    const respuesta = await fetch(proxyUrl)
    if (!respuesta.ok) {
      console.warn(`[Yahoo] Error HTTP ${respuesta.status} para ${ticker}`)
      return null
    }

    const yahoo = await respuesta.json()
    const resultado = yahoo?.chart?.result?.[0]
    if (!resultado) {
      console.warn(`[Yahoo] Sin datos OHLCV para ${ticker}`)
      return null
    }

    const timestamps = resultado.timestamp
    const { open, high, low, close, volume } = resultado.indicators.quote[0]

    // 1. Construimos las velas filtrando las que tienen datos nulos
    const velas = timestamps
      .map((t, i) => ({
        time: t,
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume[i] ?? 0
      }))
      .filter(
        v =>
          v.open !== null &&
          v.open !== undefined &&
          v.close !== null &&
          v.close !== undefined &&
          v.high !== null &&
          v.high !== undefined &&
          v.low !== null &&
          v.low !== undefined
      )

    // 2. Ordenamos por timestamp ascendente (lightweight-charts lo requiere)
    velas.sort((a, b) => a.time - b.time)

    // 3. Eliminamos timestamps duplicados (Yahoo los devuelve a veces en intradiario)
    const velasSinDuplicados = velas.filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time)
    // Eliminamos la última vela si tiene volumen 0 (vela incompleta en intradiario)
    if (velasSinDuplicados.length > 1 && velasSinDuplicados[velasSinDuplicados.length - 1].volume === 0) {
      velasSinDuplicados.pop()
    }
    return velasSinDuplicados
  } catch (error) {
    console.error(`[Yahoo] Error obteniendo velas de ${ticker}:`, error)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 3: Buscador inteligente de tickers
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarTickers(query) {
  if (!query || query.length < 2) return []
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`
    const respuesta = await fetch(proxyUrl)
    if (!respuesta.ok) return []
    const datos = await respuesta.json()
    const quotes = datos?.quotes || []
    return quotes
      .filter(q => q.symbol && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType))
      .map(q => ({
        symbol: q.symbol,
        nombre: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || ''
      }))
  } catch {
    return []
  }
}
