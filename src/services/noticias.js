// src/services/noticias.js
// ─────────────────────────────────────────────────────────────────────────────
// Servicio de noticias financieras via RSS.
// Soporta noticias por ticker (Yahoo Finance) y noticias macro generales.
// Las noticias en inglés se traducen con MyMemory API.
// ─────────────────────────────────────────────────────────────────────────────

const CORS_PROXY = 'https://corsproxy.io/?url='

// ── Fuentes de noticias macro ─────────────────────────────────────────────────
export const FUENTES_MACRO = [
  {
    id: 'expansion',
    nombre: 'Expansión',
    url: 'https://www.expansion.com/rss/mercados.xml',
    idioma: 'es'
  },
  {
    id: 'eleconomista',
    nombre: 'El Economista',
    url: 'https://www.eleconomista.es/rss/rss-mercados.php',
    idioma: 'es'
  },
  {
    id: 'investing',
    nombre: 'Investing.com',
    url: 'https://es.investing.com/rss/news.rss',
    idioma: 'es'
  },
  {
    id: 'elPais',
    nombre: 'El País Economía',
    url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada',
    idioma: 'es'
  }
]

// ── Traducción ────────────────────────────────────────────────────────────────

function esIngles(texto) {
  const palabras = ['the', 'is', 'are', 'was', 'were', 'has', 'have', 'will', 'would', 'could', 'should', 'that', 'this', 'with', 'for', 'and']
  const partes = texto.toLowerCase().split(' ')
  return partes.filter(p => palabras.includes(p)).length >= 2
}

async function traducir(texto) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=en|es`
    const res = await fetch(url)
    if (!res.ok) return texto
    const datos = await res.json()
    const traduccion = datos?.responseData?.translatedText
    if (!traduccion || traduccion === texto) return texto
    return traduccion
  } catch {
    return texto
  }
}

// ── Parser de RSS ─────────────────────────────────────────────────────────────

/**
 * Parsea un feed RSS y devuelve un array de noticias.
 * Traduce automáticamente los títulos en inglés.
 */
async function parsearRSS(url, fuente, idioma = 'es') {
  try {
    const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`
    const res = await fetch(proxyUrl)
    if (!res.ok) return []

    const texto = await res.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(texto, 'text/xml')
    const items = Array.from(xml.querySelectorAll('item'))

    if (items.length === 0) return []

    const noticias = items.slice(0, 8).map(item => ({
      titulo: item.querySelector('title')?.textContent?.trim() ?? '',
      enlace: item.querySelector('link')?.textContent?.trim() ?? '#',
      fecha: item.querySelector('pubDate')?.textContent?.trim() ?? '',
      fuente,
      idioma
    }))

    // Traducimos las que están en inglés
    const resultado = await Promise.all(
      noticias.map(async n => {
        if (idioma === 'en' || esIngles(n.titulo)) {
          return { ...n, titulo: await traducir(n.titulo), traducida: true }
        }
        return n
      })
    )

    return resultado.filter(n => n.titulo.length > 0)
  } catch (err) {
    console.error(`[Noticias] Error en ${fuente}:`, err)
    return []
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Obtiene noticias de Yahoo Finance para un ticker concreto.
 * Usa el feed en inglés que es más completo y traduce automáticamente.
 */
export async function obtenerNoticias(ticker, nombreEmpresa = '') {
  const busqueda = nombreEmpresa || ticker.split('.')[0]
  const query = encodeURIComponent(`${busqueda} bolsa acciones`)
  const url = `https://news.google.com/rss/search?q=${query}&hl=es&gl=ES&ceid=ES:es`
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`

  try {
    const res = await fetch(proxyUrl)
    if (!res.ok) return []
    const texto = await res.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(texto, 'text/xml')
    const items = Array.from(xml.querySelectorAll('item'))

    const noticias = items
      .map(item => ({
        titulo: item.querySelector('title')?.textContent?.trim() ?? '',
        enlace: item.querySelector('link')?.textContent?.trim() ?? '#',
        fecha: item.querySelector('pubDate')?.textContent?.trim() ?? '',
        fuente: item.querySelector('source')?.textContent?.trim() ?? 'Google News',
        traducida: false
      }))
      .filter(n => n.titulo.length > 0)

    // Ordenamos por fecha descendente y limitamos a 8
    return noticias.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 8)
  } catch {
    return []
  }
}
/**
 * Obtiene noticias macro de todas las fuentes configuradas.
 * Las peticiones se hacen en paralelo.
 *
 * @param {string[]} fuentesIds - Array de IDs de fuentes a incluir.
 *   Si está vacío, usa todas.
 * @returns {Promise<Array>} Noticias mezcladas y ordenadas por fecha
 */
export async function obtenerNoticiasMacro(fuentesIds = []) {
  const fuentes = fuentesIds.length > 0 ? FUENTES_MACRO.filter(f => fuentesIds.includes(f.id)) : FUENTES_MACRO

  const resultados = await Promise.allSettled(fuentes.map(f => parsearRSS(f.url, f.nombre, f.idioma)))

  // Mezclamos todas las noticias
  const todas = resultados.flatMap((r, i) => (r.status === 'fulfilled' ? r.value.map(n => ({ ...n, fuenteId: fuentes[i].id })) : []))

  // Ordenamos por fecha descendente
  todas.sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha).getTime() : 0
    const fb = b.fecha ? new Date(b.fecha).getTime() : 0
    return fb - fa
  })

  return todas
}

/**
 * Formatea una fecha RSS a formato legible en español.
 */
export function formatearFecha(fechaRss) {
  try {
    const fecha = new Date(fechaRss)
    const ahora = new Date()
    const diffMs = ahora - fecha
    const diffH = Math.floor(diffMs / (1000 * 60 * 60))
    const diffD = Math.floor(diffH / 24)

    if (diffH < 1) return 'Hace menos de 1 hora'
    if (diffH < 24) return `Hace ${diffH}h`
    if (diffD < 7) return `Hace ${diffD}d`

    return fecha.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return ''
  }
}
