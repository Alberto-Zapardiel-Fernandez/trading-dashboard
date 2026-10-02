// worker/yahoo-proxy.js
// ─────────────────────────────────────────────────────────────────────────────
// Proxy PROPIO para Yahoo Finance, desplegado como Cloudflare Worker (gratis).
//
// ¿Por qué existe?
//   Yahoo no envía cabeceras CORS, así que el navegador no puede llamarle
//   directamente. Hasta ahora usábamos proxies públicos (corsproxy.io,
//   allorigins...) pero Yahoo ha bloqueado sus IPs y exige un "crumb" (token
//   de sesión) en algunos endpoints. Este Worker:
//     1. Obtiene cookie + crumb de Yahoo y los reutiliza (caché en memoria).
//     2. Llama a Yahoo con un User-Agent de navegador.
//     3. Devuelve la respuesta añadiendo cabeceras CORS.
//     4. Solo acepta peticiones desde TUS orígenes (no es un proxy abierto).
//
// Rutas que expone (lista blanca, nada más):
//   GET /chart/{ticker}?interval=1d&range=2y  → Yahoo v8/finance/chart
//   GET /search?q=santander&quotesCount=8     → Yahoo v1/finance/search
// ─────────────────────────────────────────────────────────────────────────────

// Orígenes desde los que se permite llamar al Worker
const ORIGENES_PERMITIDOS = [
  'https://alberto-zapardiel-fernandez.github.io', // producción (GitHub Pages)
  'http://localhost:5173', // desarrollo (npm run dev)
  'http://localhost:4173' // preview (npm run preview)
]

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Sesión de Yahoo cacheada en memoria del Worker (se pierde si Cloudflare
// reinicia la instancia; en ese caso simplemente se vuelve a pedir).
let sesion = null // { cookie, crumb, expira }

// Pide cookie + crumb a Yahoo. `forzar` ignora la caché.
async function obtenerSesion(forzar = false) {
  if (!forzar && sesion && sesion.expira > Date.now()) return sesion

  // 1) fc.yahoo.com responde 404 pero nos da la cookie de sesión (A3)
  const r1 = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'manual'
  })
  const cookie = (r1.headers.get('set-cookie') || '').split(';')[0]

  // 2) Con esa cookie pedimos el crumb
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie }
  })
  const crumb = (await r2.text()).trim()

  // Si Yahoo nos devuelve HTML o vacío, algo ha ido mal
  if (!crumb || crumb.includes('<') || crumb.length > 50) {
    throw new Error('No se pudo obtener el crumb de Yahoo')
  }

  // La sesión dura 1 hora en nuestra caché
  sesion = { cookie, crumb, expira: Date.now() + 60 * 60 * 1000 }
  return sesion
}

// Cabeceras CORS para la respuesta
function cabecerasCors(origen) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  }
}

// Respuesta JSON de error con CORS
function error(status, mensaje, origen) {
  return new Response(JSON.stringify({ error: mensaje }), {
    status,
    headers: { 'Content-Type': 'application/json', ...cabecerasCors(origen) }
  })
}

// Llama a Yahoo con la sesión; si responde 401/403 renueva la sesión y reintenta una vez
async function llamarYahoo(urlBase, params, ttl) {
  for (let intento = 0; intento < 2; intento++) {
    const s = await obtenerSesion(intento === 1)
    const url = new URL(urlBase)
    params.forEach((valor, clave) => url.searchParams.set(clave, valor))
    url.searchParams.set('crumb', s.crumb)

    const resp = await fetch(url.toString(), {
      headers: { 'User-Agent': UA, Cookie: s.cookie, Accept: 'application/json' },
      // Caché de Cloudflare: evita golpear a Yahoo con peticiones repetidas
      cf: { cacheTtl: ttl, cacheEverything: true }
    })
    if (resp.status !== 401 && resp.status !== 403) return resp
  }
  throw new Error('Yahoo rechazó la sesión tras reintentar')
}

export default {
  async fetch(request) {
    const origen = request.headers.get('Origin') || ''
    const origenValido = ORIGENES_PERMITIDOS.includes(origen)

    // Preflight CORS del navegador
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cabecerasCors(origenValido ? origen : 'null') })
    }
    if (request.method !== 'GET') return error(405, 'Método no permitido', origen)

    // Bloqueamos cualquier origen que no sea el nuestro
    if (!origenValido) return error(403, 'Origen no permitido', 'null')

    const url = new URL(request.url)

    try {
      let respuestaYahoo

      if (url.pathname.startsWith('/chart/')) {
        // /chart/SAN.MC?interval=1d&range=2y
        const ticker = decodeURIComponent(url.pathname.slice('/chart/'.length))
        if (!ticker || ticker.length > 20) return error(400, 'Ticker inválido', origen)
        respuestaYahoo = await llamarYahoo(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
          url.searchParams,
          30 // 30 s de caché: precios casi en vivo
        )
      } else if (url.pathname === '/search') {
        // /search?q=santander&quotesCount=8
        respuestaYahoo = await llamarYahoo(
          'https://query1.finance.yahoo.com/v1/finance/search',
          url.searchParams,
          300 // 5 min: las búsquedas no cambian rápido
        )
      } else {
        return error(404, 'Ruta no encontrada', origen)
      }

      return new Response(respuestaYahoo.body, {
        status: respuestaYahoo.status,
        headers: { 'Content-Type': 'application/json', ...cabecerasCors(origen) }
      })
    } catch (e) {
      return error(502, e.message, origen)
    }
  }
}
