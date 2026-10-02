// src/services/yahooFinance.js
// ─────────────────────────────────────────────────────────────────────────────
// Cliente de Yahoo Finance.
// Ya NO usa proxies públicos: llama a nuestro propio Cloudflare Worker
// (ver worker/yahoo-proxy.js). La URL se define en .env.local:
//   VITE_YAHOO_PROXY_URL=https://yahoo-proxy.TU-USUARIO.workers.dev
//
// Exports (los mismos que antes, el resto de la app no cambia):
//   obtenerPrecio, obtenerEurUsd, obtenerPrecios, obtenerVelas, buscarTickers
// ─────────────────────────────────────────────────────────────────────────────

// URL base del Worker, sin barra final
const PROXY = (import.meta.env.VITE_YAHOO_PROXY_URL || '').replace(/\/$/, '')

if (!PROXY) {
  console.error('[Yahoo] Falta VITE_YAHOO_PROXY_URL en .env.local (o en las variables del repo para el deploy)')
}

// ── Caché en memoria ─────────────────────────────────────────────────────────
// Evita repetir la misma petición varias veces seguidas (p. ej. al cambiar de
// página). Guarda también las peticiones EN CURSO para no duplicarlas.
const cache = new Map() // clave → { valor, expira }
const enCurso = new Map() // clave → Promise

async function conCache(clave, ttlMs, funcion) {
  const hit = cache.get(clave)
  if (hit && hit.expira > Date.now()) return hit.valor
  if (enCurso.has(clave)) return enCurso.get(clave)

  const promesa = funcion()
    .then(valor => {
      // Solo cacheamos resultados válidos (null = fallo, que se reintente)
      if (valor !== null && valor !== undefined) {
        cache.set(clave, { valor, expira: Date.now() + ttlMs })
      }
      return valor
    })
    .finally(() => enCurso.delete(clave))

  enCurso.set(clave, promesa)
  return promesa
}

// Llama al Worker y devuelve el JSON (o null si falla)
async function pedirJson(ruta) {
  if (!PROXY) return null
  try {
    const respuesta = await fetch(`${PROXY}${ruta}`)
    if (!respuesta.ok) {
      console.warn(`[Yahoo] HTTP ${respuesta.status} en ${ruta}`)
      return null
    }
    return await respuesta.json()
  } catch (error) {
    console.error(`[Yahoo] Error de red en ${ruta}:`, error)
    return null
  }
}

// ── Precio actual ────────────────────────────────────────────────────────────

export async function obtenerPrecio(ticker) {
  return conCache(`precio:${ticker}`, 30_000, async () => {
    const yahoo = await pedirJson(`/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`)
    const precio = yahoo?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (precio === undefined) {
      console.warn(`[Yahoo] No se encontró precio para ${ticker}`)
      return null
    }
    return precio
  })
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

// ── Velas OHLCV para la gráfica ──────────────────────────────────────────────

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
  const { interval, range } = TEMPORALIDADES[temporalidad] ?? TEMPORALIDADES['1D']

  // Velas intradiarias: caché corta (1 min). Diarias o mayores: 5 min.
  const ttl = interval.endsWith('m') ? 60_000 : 300_000

  return conCache(`velas:${ticker}:${interval}:${range}`, ttl, async () => {
    const yahoo = await pedirJson(`/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`)
    const resultado = yahoo?.chart?.result?.[0]
    if (!resultado?.timestamp) {
      console.warn(`[Yahoo] Sin datos OHLCV para ${ticker}`)
      return null
    }

    const timestamps = resultado.timestamp
    const { open, high, low, close, volume } = resultado.indicators.quote[0]

    // 1. Construimos las velas descartando las que tienen datos nulos
    const velas = timestamps
      .map((t, i) => ({
        time: t,
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
        volume: volume[i] ?? 0
      }))
      .filter(v => v.open != null && v.high != null && v.low != null && v.close != null)

    // 2. lightweight-charts exige orden ascendente por timestamp
    velas.sort((a, b) => a.time - b.time)

    // 3. Quitamos timestamps duplicados (Yahoo los repite a veces en intradiario)
    const sinDuplicados = velas.filter((v, i, arr) => i === 0 || v.time !== arr[i - 1].time)

    // 4. Quitamos la última vela si tiene volumen 0 (vela incompleta)
    if (sinDuplicados.length > 1 && sinDuplicados[sinDuplicados.length - 1].volume === 0) {
      sinDuplicados.pop()
    }
    return sinDuplicados
  })
}

// ── Buscador de tickers ──────────────────────────────────────────────────────

// Lista local de emergencia: si el Worker falla, el buscador sigue dando
// sugerencias de los tickers más habituales en vez de quedarse vacío.
const TICKERS_LOCALES = [
  { symbol: 'SAN.MC', nombre: 'Banco Santander', exchange: 'MCE' },
  { symbol: 'BBVA.MC', nombre: 'BBVA', exchange: 'MCE' },
  { symbol: 'ITX.MC', nombre: 'Inditex', exchange: 'MCE' },
  { symbol: 'IBE.MC', nombre: 'Iberdrola', exchange: 'MCE' },
  { symbol: 'TEF.MC', nombre: 'Telefónica', exchange: 'MCE' },
  { symbol: 'REP.MC', nombre: 'Repsol', exchange: 'MCE' },
  { symbol: 'PEP', nombre: 'PepsiCo', exchange: 'NMS' },
  { symbol: 'AAPL', nombre: 'Apple', exchange: 'NMS' },
  { symbol: 'MSFT', nombre: 'Microsoft', exchange: 'NMS' },
  { symbol: 'NVDA', nombre: 'NVIDIA', exchange: 'NMS' },
  { symbol: 'TSLA', nombre: 'Tesla', exchange: 'NMS' },
  { symbol: 'AMZN', nombre: 'Amazon', exchange: 'NMS' },
  { symbol: 'VUAA.DE', nombre: 'Vanguard S&P 500 UCITS ETF', exchange: 'GER' },
  { symbol: 'VUSA.DE', nombre: 'Vanguard S&P 500 UCITS ETF (Dist)', exchange: 'GER' },
  { symbol: 'SPY', nombre: 'SPDR S&P 500 ETF', exchange: 'PCX' }
]

function buscarEnLocal(query) {
  const q = query.toLowerCase()
  return TICKERS_LOCALES.filter(t => t.symbol.toLowerCase().includes(q) || t.nombre.toLowerCase().includes(q)).slice(0, 8)
}

export async function buscarTickers(query) {
  if (!query || query.length < 2) return []

  const resultado = await conCache(`busqueda:${query.toLowerCase()}`, 300_000, async () => {
    const datos = await pedirJson(`/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`)
    if (!datos) return null // fallo → usaremos la lista local
    return (datos.quotes || [])
      .filter(q => q.symbol && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType))
      .map(q => ({
        symbol: q.symbol,
        nombre: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || ''
      }))
  })

  // Si el Worker falló (null), caemos a la lista local
  return resultado ?? buscarEnLocal(query)
}
