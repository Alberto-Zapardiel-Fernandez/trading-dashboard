// src/services/yahooFinance.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio para obtener precios de Yahoo Finance sin backend.
// Yahoo Finance bloquea peticiones directas desde el navegador (CORS),
// así que usamos allorigins.win como proxy gratuito que añade las cabeceras
// necesarias. No requiere API key.
// ─────────────────────────────────────────────────────────────────────────────

// URL base del proxy CORS
const CORS_PROXY = 'https://api.allorigins.win/get?url='

// URL base de Yahoo Finance (endpoint no oficial pero estable)
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/'

/**
 * Obtiene el precio actual de un ticker de Yahoo Finance.
 *
 * @param {string} ticker - El símbolo del activo, tal como lo conoce Yahoo Finance.
 *   Ejemplos:
 *     - Acción española: "SAN.MC" (Santander en Madrid)
 *     - Acción USA:      "PEP"    (PepsiCo en NASDAQ)
 *     - ETF europeo:     "VUSA.DE" (Vanguard S&P500 en Xetra)
 *
 * @returns {Promise<number|null>} El precio actual en la moneda del mercado,
 *   o null si hay algún error.
 */
export async function obtenerPrecio(ticker) {
  try {
    // Construimos la URL de Yahoo Finance para este ticker
    const yahooUrl = `${YAHOO_BASE}${ticker}?interval=1m&range=1d`

    // La envolvemos en el proxy para evitar el bloqueo CORS
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`

    const respuesta = await fetch(proxyUrl)

    if (!respuesta.ok) {
      console.warn(`[Yahoo] Error HTTP ${respuesta.status} para ${ticker}`)
      return null
    }

    // allorigins devuelve { contents: "...json de yahoo..." }
    const datos = await respuesta.json()
    const yahoo = JSON.parse(datos.contents)

    // Navegamos por la estructura anidada de Yahoo Finance
    const precio = yahoo?.chart?.result?.[0]?.meta?.regularMarketPrice

    if (precio === undefined) {
      console.warn(`[Yahoo] No se encontró precio para ${ticker}`)
      return null
    }

    return precio
  } catch (error) {
    // Puede fallar por red, por CORS, o si el ticker no existe
    console.error(`[Yahoo] Error obteniendo precio de ${ticker}:`, error)
    return null
  }
}

/**
 * Obtiene el tipo de cambio EUR/USD desde Yahoo Finance.
 * El ticker del par de divisas en Yahoo es "EURUSD=X".
 *
 * @returns {Promise<number|null>} El tipo de cambio actual, o null si falla.
 */
export async function obtenerEurUsd() {
  return obtenerPrecio('EURUSD=X')
}

/**
 * Obtiene precios de múltiples tickers a la vez.
 * Las peticiones se hacen en paralelo para no esperar una por una.
 *
 * @param {string[]} tickers - Array de símbolos Yahoo Finance.
 * @returns {Promise<Object>} Objeto { ticker: precio } para cada uno.
 *   Si un ticker falla, su valor será null (los demás siguen funcionando).
 *
 * Ejemplo de resultado: { "SAN.MC": 4.23, "PEP": 142.5, "EURUSD=X": 1.085 }
 */
export async function obtenerPrecios(tickers) {
  // Promise.allSettled en lugar de Promise.all para que si uno falla,
  // los demás sigan adelante
  const resultados = await Promise.allSettled(tickers.map(ticker => obtenerPrecio(ticker)))

  // Convertimos el array de resultados en un objeto { ticker: precio }
  return tickers.reduce((acumulador, ticker, indice) => {
    const resultado = resultados[indice]
    acumulador[ticker] = resultado.status === 'fulfilled' ? resultado.value : null
    return acumulador
  }, {})
}
