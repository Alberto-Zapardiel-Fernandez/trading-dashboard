// scripts/alertas.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Motor de alertas — ejecutado cada 30 min por GitHub Actions.
//
// Sprint 25: se añade el motor de alertas de NOTICIAS.
//   Se puede activar/desactivar desde Configuración (campo alertasNoticias).
//
// ARQUITECTURA:
//   El script hace DOS pasadas independientes por cada usuario:
//     1. procesarTicker()        → señales técnicas (existente)
//     2. procesarNoticiasUsuario() → noticias relevantes por ticker (nuevo)
//
// NOTICIAS — CÓMO FUNCIONA:
//   · Busca en Google News RSS los tickers del radar del usuario
//   · Filtra por palabras clave financieras (español + inglés)
//   · Solo envía noticias de las últimas 24 horas
//   · Anti-spam: guarda en Firestore un array de hashes de los títulos
//     ya enviados (campo noticiasEnviadas en config/principal)
//     Máximo 100 hashes — se rotan para no crecer indefinidamente
//   · Respeta el horario de silencio nocturno igual que las señales técnicas
//   · Un mensaje por ticker que tenga noticias nuevas (todas agrupadas)
//
// SEÑALES TÉCNICAS — sin cambios respecto al sprint anterior.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore }        from 'firebase-admin/firestore'

// ── Inicialización ────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN  = process.env.VITE_TELEGRAM_TOKEN
const serviceAccount  = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ── Horario de silencio ───────────────────────────────────────────────────────

function esHorarioSilencio(desde = 23, hasta = 7) {
  const h = new Date().getUTCHours()
  if (desde > hasta) return h >= desde || h < hasta
  return h >= desde && h < hasta
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function enviarTelegram(chatId, mensaje, silencioDesde, silencioHasta) {
  if (!chatId || !TELEGRAM_TOKEN) return false
  if (esHorarioSilencio(silencioDesde, silencioHasta)) {
    console.log('    [Telegram] Silencio nocturno — no enviado')
    return false
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: 'Markdown' })
    })
    const data = await res.json()
    if (!data.ok) { console.error('    [Telegram] Error:', data.description); return false }
    return true
  } catch (err) {
    console.error('    [Telegram] Error de red:', err.message)
    return false
  }
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

async function obtenerVelas(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return null
    const data  = await res.json()
    const chart = data?.chart?.result?.[0]
    if (!chart) return null
    const ts = chart.timestamp
    const q  = chart.indicators.quote[0]
    return ts
      .map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] }))
      .filter(v => v.close != null)
  } catch (err) {
    console.error(`    [Yahoo] Error ${symbol}:`, err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO DE NOTICIAS (Sprint 25)
// ─────────────────────────────────────────────────────────────────────────────

// ── Hash simple de un string ──────────────────────────────────────────────────
// No necesitamos criptografía — solo un identificador estable para saber
// si ya hemos enviado esta noticia. djb2 es suficiente.
function hashTitulo(titulo) {
  let h = 5381
  for (let i = 0; i < titulo.length; i++) {
    h = ((h << 5) + h) ^ titulo.charCodeAt(i)
    h = h >>> 0 // mantener 32 bits sin signo
  }
  return h.toString(16)
}

// ── Palabras clave financieras relevantes ─────────────────────────────────────
// Solo pasan noticias que contengan al menos UNA de estas palabras.
// Divididas en español e inglés (el usuario eligió ambos idiomas).
const PALABRAS_CLAVE_ES = [
  'resultado', 'beneficio', 'pérdida', 'dividendo', 'opa', 'fusión', 'adquisición',
  'deuda', 'ampliación', 'capital', 'suspende', 'quiebra', 'récord', 'caída',
  'subida', 'rebaja', 'sube', 'baja', 'recorte', 'inversión', 'acuerdo',
  'contrato', 'regulación', 'multa', 'sanción', 'ceo', 'director', 'dimite',
  'presenta', 'trimestre', 'anual', 'previsión', 'objetivo', 'precio'
]

const PALABRAS_CLAVE_EN = [
  'earnings', 'revenue', 'profit', 'loss', 'dividend', 'acquisition', 'merger',
  'ipo', 'buyback', 'debt', 'downgrade', 'upgrade', 'record', 'drops', 'rises',
  'falls', 'gains', 'cut', 'raise', 'investment', 'deal', 'contract', 'fine',
  'ceo', 'quarterly', 'annual', 'forecast', 'guidance', 'target', 'shares',
  'stock', 'rally', 'crash', 'bankruptcy', 'restructuring', 'layoffs'
]

const TODAS_PALABRAS_CLAVE = [...PALABRAS_CLAVE_ES, ...PALABRAS_CLAVE_EN]

// ── Filtro de relevancia ───────────────────────────────────────────────────────
// Devuelve true si el título contiene alguna palabra clave financiera.
// La comparación es case-insensitive.
function esNoticiaRelevante(titulo) {
  if (!titulo) return false
  const tituloLower = titulo.toLowerCase()
  return TODAS_PALABRAS_CLAVE.some(palabra => tituloLower.includes(palabra))
}

// ── Parseo de RSS en Node.js ───────────────────────────────────────────────────
// En Node no existe DOMParser. Usamos regex para extraer los <item> del XML.
// Es menos elegante que un parser real, pero no requiere dependencias extra
// y es suficientemente robusto para feeds RSS estándar.
function parsearRssNode(xmlTexto) {
  const items = []
  // Extraer bloques <item>...</item>
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xmlTexto)) !== null) {
    const bloque = match[1]

    // Extraer campos del item — CDATA y texto plano
    const titulo = extraerCampo(bloque, 'title')
    const enlace  = extraerCampo(bloque, 'link')
    const pubDate = extraerCampo(bloque, 'pubDate')
    const fuente  = extraerCampo(bloque, 'source') || 'Google News'

    if (titulo) {
      items.push({ titulo, enlace, pubDate, fuente })
    }
  }
  return items
}

// Extrae el contenido de un tag XML, soportando CDATA y texto plano
function extraerCampo(bloque, tag) {
  // Intento 1: CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')
  const cdataMatch = bloque.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1].trim()

  // Intento 2: texto plano
  const plainRegex = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i')
  const plainMatch = bloque.match(plainRegex)
  if (plainMatch) return plainMatch[1].trim()

  return ''
}

// ── Obtener noticias de Google News para un ticker ────────────────────────────
// Versión Node.js de la función obtenerNoticias() de noticias.js (frontend).
// La diferencia es que aquí parseamos el XML con regex en vez de DOMParser.
//
// Parámetros:
//   symbol  — ticker Yahoo Finance (ej: 'VUSA.DE')
//   nombre  — nombre corto para la búsqueda (ej: 'VUSA', 'Inditex')
//
// Devuelve array de { titulo, enlace, pubDate, fuente } de las últimas 24h
async function obtenerNoticiasGoogle(symbol, nombre) {
  // Usamos el nombre si está disponible — da mejores resultados que el ticker
  const termino = nombre && nombre !== symbol ? nombre : symbol.split('.')[0]
  const query   = encodeURIComponent(`${termino} bolsa acciones`)
  const url     = `https://news.google.com/rss/search?q=${query}&hl=es&gl=ES&ceid=ES:es`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingDashboard/1.0)' }
    })
    if (!res.ok) {
      console.log(`      [Noticias] HTTP ${res.status} para ${symbol}`)
      return []
    }

    const xmlTexto = await res.text()
    const items    = parsearRssNode(xmlTexto)

    // Filtrar las últimas 24 horas
    const hace24h = Date.now() - 24 * 60 * 60 * 1000
    const recientes = items.filter(item => {
      if (!item.pubDate) return false
      const ts = new Date(item.pubDate).getTime()
      return !isNaN(ts) && ts >= hace24h
    })

    return recientes
  } catch (err) {
    console.error(`      [Noticias] Error red ${symbol}:`, err.message)
    return []
  }
}

// ── Procesado de noticias para un usuario ─────────────────────────────────────
// Recorre todos los tickers del radar, busca noticias relevantes nuevas,
// y envía un mensaje Telegram agrupado por ticker.
//
// Anti-spam: los hashes de los títulos ya enviados se guardan en Firestore
// en config/principal.noticiasEnviadas (array de strings).
// Se mantiene un máximo de MAX_HASHES_GUARDADOS para no crecer sin límite.
const MAX_HASHES_GUARDADOS = 100

async function procesarNoticiasUsuario(uid, chatId, config, silencioDesde, silencioHasta) {
  // Si el usuario tiene alertas de noticias desactivadas, salimos
  if (config.alertasNoticias === false) {
    console.log(`  [Noticias] Desactivadas por el usuario`)
    return
  }

  const radarSnap = await db.collection(`users/${uid}/radar`).get()
  if (radarSnap.empty) return

  // Hashes de noticias ya enviadas (anti-spam)
  const hashesGuardados = new Set(config.noticiasEnviadas || [])
  const hashesNuevos    = [] // los que añadiremos en esta ejecución

  let hayNovedades = false

  for (const tickerDoc of radarSnap.docs) {
    const ticker = { id: tickerDoc.id, ...tickerDoc.data() }
    const symbol = ticker.symbol
    const nombre = ticker.nombre || symbol

    if (!symbol) continue
    console.log(`    [Noticias] Buscando para ${symbol}...`)

    let noticias
    try {
      noticias = await obtenerNoticiasGoogle(symbol, nombre)
    } catch (err) {
      console.error(`    [Noticias] Error ${symbol}:`, err.message)
      continue
    }

    if (!noticias || noticias.length === 0) {
      console.log(`      → Sin noticias recientes`)
      continue
    }

    // Filtrar por relevancia y por anti-spam
    const noticiasNuevas = noticias.filter(n => {
      if (!esNoticiaRelevante(n.titulo)) return false // no relevante
      const h = hashTitulo(n.titulo)
      if (hashesGuardados.has(h)) return false        // ya enviada
      return true
    })

    if (noticiasNuevas.length === 0) {
      console.log(`      → ${noticias.length} noticia(s) pero ninguna nueva/relevante`)
      continue
    }

    console.log(`      → ${noticiasNuevas.length} noticia(s) nueva(s) relevantes`)
    hayNovedades = true

    // Construir mensaje agrupado para este ticker
    const mensaje = construirMensajeNoticias(symbol, nombre, noticiasNuevas)
    await enviarTelegram(chatId, mensaje, silencioDesde, silencioHasta)

    // Registrar los hashes enviados en esta ejecución
    for (const n of noticiasNuevas) {
      const h = hashTitulo(n.titulo)
      hashesGuardados.add(h)
      hashesNuevos.push(h)
    }

    // Pequeña pausa entre tickers para no saturar la API de Telegram
    await new Promise(r => setTimeout(r, 500))
  }

  // Persistir los hashes nuevos en Firestore (si hay alguno)
  if (hashesNuevos.length > 0) {
    // Convertir el Set completo a array y truncar al máximo
    let todosLosHashes = [...hashesGuardados]
    if (todosLosHashes.length > MAX_HASHES_GUARDADOS) {
      // Quedarse con los últimos MAX_HASHES_GUARDADOS (los más recientes)
      todosLosHashes = todosLosHashes.slice(-MAX_HASHES_GUARDADOS)
    }
    await db.doc(`users/${uid}/config/principal`).update({
      noticiasEnviadas: todosLosHashes
    })
    console.log(`  [Noticias] ${hashesNuevos.length} hash(es) nuevos guardados en Firestore`)
  }

  if (!hayNovedades) {
    console.log(`  [Noticias] Sin novedades en esta ejecución`)
  }
}

// ── Construcción del mensaje de noticias ──────────────────────────────────────
// Un mensaje por ticker, con todas sus noticias nuevas agrupadas.
// Formato limpio con emoji, título como enlace y fuente.
function construirMensajeNoticias(symbol, nombre, noticias) {
  const lineas = []

  lineas.push(`📰 *Noticias — ${nombre !== symbol ? nombre : symbol}*`)
  if (nombre !== symbol) lineas.push(`_${symbol}_`)
  lineas.push(`_Últimas 24 horas · ${noticias.length} noticia${noticias.length > 1 ? 's' : ''} relevante${noticias.length > 1 ? 's' : ''}_`)
  lineas.push('')

  for (const n of noticias) {
    // Limpiar el título de caracteres problemáticos para Markdown
    const titulo = n.titulo
      .replace(/[*_`[\]()~>#+=|{}.!-]/g, c => `\\${c}`) // escapar Markdown
      .substring(0, 200) // truncar títulos muy largos

    // Formato: bullet + título con enlace (si hay enlace válido)
    if (n.enlace && n.enlace.startsWith('http')) {
      lineas.push(`• [${titulo}](${n.enlace})`)
    } else {
      lineas.push(`• ${titulo}`)
    }

    // Fuente y hora
    const partes = []
    if (n.fuente) partes.push(n.fuente)
    if (n.pubDate) {
      const fecha = new Date(n.pubDate)
      if (!isNaN(fecha)) {
        partes.push(fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) + 'h')
      }
    }
    if (partes.length > 0) lineas.push(`  _${partes.join(' · ')}_`)
    lineas.push('')
  }

  return lineas.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO DE SEÑALES TÉCNICAS (sin cambios desde sprint anterior)
// ─────────────────────────────────────────────────────────────────────────────

function sma(velas, n) {
  if (velas.length < n) return []
  const res = []
  for (let i = n - 1; i < velas.length; i++) {
    const suma = velas.slice(i - n + 1, i + 1).reduce((a, v) => a + v.close, 0)
    res.push(suma / n)
  }
  return res
}

function ema(velas, n) {
  if (velas.length < n) return []
  const k   = 2 / (n + 1)
  const res = []
  let val   = velas.slice(0, n).reduce((a, v) => a + v.close, 0) / n
  res.push(val)
  for (let i = n; i < velas.length; i++) {
    val = velas[i].close * k + val * (1 - k)
    res.push(val)
  }
  return res
}

function rsi(velas, n = 14) {
  if (velas.length < n + 1) return []
  const cambios = velas.slice(1).map((v, i) => v.close - velas[i].close)
  let g = cambios.slice(0, n).filter(c => c > 0).reduce((a, b) => a + b, 0) / n
  let p = Math.abs(cambios.slice(0, n).filter(c => c < 0).reduce((a, b) => a + b, 0)) / n
  const res = []
  for (let i = n; i < cambios.length; i++) {
    g = (g * (n - 1) + Math.max(cambios[i], 0)) / n
    p = (p * (n - 1) + Math.abs(Math.min(cambios[i], 0))) / n
    res.push(p === 0 ? 100 : 100 - 100 / (1 + g / p))
  }
  return res
}

function macd(velas) {
  const e12 = ema(velas, 12)
  const e26 = ema(velas, 26)
  if (e12.length < 26 || e26.length < 1) return { linea: [], signal: [], hist: [] }
  const offset   = e12.length - e26.length
  const macdLine = e26.map((v, i) => e12[i + offset] - v)
  const k   = 2 / (9 + 1)
  let sv    = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9
  const sig = [sv]
  for (let i = 9; i < macdLine.length; i++) {
    sv = macdLine[i] * k + sv * (1 - k)
    sig.push(sv)
  }
  const off2 = macdLine.length - sig.length
  const hist  = sig.map((s, i) => macdLine[i + off2] - s)
  return { linea: macdLine.slice(off2), signal: sig, hist }
}

function volumenMedio(velas, n = 20) {
  if (velas.length < n) return null
  return velas.slice(-n).reduce((a, v) => a + (v.volume || 0), 0) / n
}

function calcularSenales(velas, ticker, config) {
  const senales = []
  if (!velas || velas.length < 30) return senales

  const n        = velas.length
  const precio   = velas[n - 1].close
  const umbraRsi = config.umbraRsiSobreventa ?? 30

  const rsiArr    = rsi(velas, 14)
  const rsiActual = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : null

  if (rsiActual !== null) {
    if (rsiActual < umbraRsi) {
      senales.push({
        id: 'rsi_sobreventa', emoji: '📉', titulo: 'RSI en SOBREVENTA',
        descripcion: `RSI (14) = *${rsiActual.toFixed(1)}* — por debajo del umbral de ${umbraRsi}.\nPosible agotamiento bajista y rebote técnico.`,
        urgente: false
      })
    } else if (rsiActual > (100 - umbraRsi)) {
      senales.push({
        id: 'rsi_sobrecompra', emoji: '📈', titulo: 'RSI en SOBRECOMPRA',
        descripcion: `RSI (14) = *${rsiActual.toFixed(1)}* — por encima de ${100 - umbraRsi}.\nPrecaución: posible corrección a corto plazo.`,
        urgente: false
      })
    }
  }

  const sma50Arr  = sma(velas, 50)
  const sma200Arr = sma(velas, 200)
  const sma50Actual  = sma50Arr.length  > 0 ? sma50Arr[sma50Arr.length - 1]   : null
  const sma50Prev    = sma50Arr.length  > 1 ? sma50Arr[sma50Arr.length - 2]   : null
  const sma200Actual = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1] : null
  const sma200Prev   = sma200Arr.length > 1 ? sma200Arr[sma200Arr.length - 2] : null

  if (config.alertasCrucesSma !== false && sma50Actual && sma200Actual && sma50Prev && sma200Prev) {
    if (sma50Prev <= sma200Prev && sma50Actual > sma200Actual) {
      senales.push({
        id: 'cruce_dorado', emoji: '✨', titulo: 'CRUCE DORADO',
        descripcion: `SMA50 (*${sma50Actual.toFixed(2)}*) ha cruzado por encima de SMA200 (*${sma200Actual.toFixed(2)}*).\nSeñal alcista de largo plazo — alta fiabilidad.`,
        urgente: true
      })
    }
    if (sma50Prev >= sma200Prev && sma50Actual < sma200Actual) {
      senales.push({
        id: 'cruce_muerte', emoji: '💀', titulo: 'CRUCE DE LA MUERTE',
        descripcion: `SMA50 (*${sma50Actual.toFixed(2)}*) ha cruzado por debajo de SMA200 (*${sma200Actual.toFixed(2)}*).\nSeñal bajista de largo plazo — considerar salida.`,
        urgente: true
      })
    }
  }

  if (config.alertasCrucesSma !== false && sma200Actual && sma200Prev) {
    const precioPrev = velas[n - 2]?.close
    if (precioPrev && precioPrev < sma200Prev && precio > sma200Actual) {
      senales.push({
        id: 'precio_sobre_sma200', emoji: '🟢', titulo: 'Precio recupera SMA200',
        descripcion: `El precio (*${precio.toFixed(3)}*) ha cruzado por encima de la SMA200 (*${sma200Actual.toFixed(2)}*).\nZona de soporte clave recuperada.`,
        urgente: false
      })
    }
    if (precioPrev && precioPrev > sma200Prev && precio < sma200Actual) {
      senales.push({
        id: 'precio_bajo_sma200', emoji: '🔴', titulo: 'Precio pierde SMA200',
        descripcion: `El precio (*${precio.toFixed(3)}*) ha caído por debajo de la SMA200 (*${sma200Actual.toFixed(2)}*).\nPérdida de soporte clave — zona de riesgo.`,
        urgente: false
      })
    }
  }

  if (config.alertasMacd !== false) {
    const { linea, signal, hist } = macd(velas)
    if (hist.length >= 2) {
      const histActual = hist[hist.length - 1]
      const histPrev   = hist[hist.length - 2]
      const macdActual = linea[linea.length - 1]
      const sigActual  = signal[signal.length - 1]
      if (histPrev < 0 && histActual > 0) {
        senales.push({
          id: 'macd_alcista', emoji: '📊', titulo: 'MACD — Cruce alcista',
          descripcion: `MACD (*${macdActual.toFixed(3)}*) ha cruzado por encima de la señal (*${sigActual.toFixed(3)}*).\nEl histograma es positivo — momentum alcista.`,
          urgente: false
        })
      }
      if (histPrev > 0 && histActual < 0) {
        senales.push({
          id: 'macd_bajista', emoji: '📊', titulo: 'MACD — Cruce bajista',
          descripcion: `MACD (*${macdActual.toFixed(3)}*) ha cruzado por debajo de la señal (*${sigActual.toFixed(3)}*).\nEl histograma es negativo — momentum bajista.`,
          urgente: false
        })
      }
    }
  }

  if (config.alertasVolumen !== false) {
    const volActual = velas[n - 1].volume
    const volMedio  = volumenMedio(velas, 20)
    if (volActual && volMedio && volActual > volMedio * 2) {
      const veces = (volActual / volMedio).toFixed(1)
      senales.push({
        id: 'volumen_anomalo', emoji: '🔊', titulo: `Volumen anómalo (×${veces})`,
        descripcion: `Volumen de hoy (*${(volActual / 1e6).toFixed(1)}M*) es ${veces}x superior a la media de 20 días (*${(volMedio / 1e6).toFixed(1)}M*).\nMovimiento institucional posible — confirma con precio.`,
        urgente: false
      })
    }
  }

  if (ticker.stop != null && precio <= ticker.stop) {
    const pct = (((ticker.stop - precio) / precio) * 100).toFixed(2)
    senales.push({
      id: 'toca_stop', emoji: '🛑', titulo: 'Precio en zona de Stop Loss',
      descripcion: `El precio (*${precio.toFixed(3)}*) ha tocado o superado el Stop Loss (*${ticker.stop}*).\nDistancia: *-${pct}%* — revisa la posición.`,
      urgente: true
    })
  }

  if (ticker.target != null && precio >= ticker.target) {
    const pct = (((precio - ticker.target) / precio) * 100).toFixed(2)
    senales.push({
      id: 'toca_target', emoji: '🎯', titulo: 'Precio alcanza Take Profit',
      descripcion: `El precio (*${precio.toFixed(3)}*) ha alcanzado el Take Profit (*${ticker.target}*).\nDistancia: *+${pct}%* — considera realizar beneficios.`,
      urgente: true
    })
  }

  return senales
}

function construirMensajeTecnico(ticker, velas, senales, config) {
  const n         = velas.length
  const precio    = velas[n - 1].close
  const rsiArr    = rsi(velas, 14)
  const sma50Arr  = sma(velas, 50)
  const sma200Arr = sma(velas, 200)
  const rsiActual = rsiArr.length    > 0 ? rsiArr[rsiArr.length - 1]       : null
  const sma50Act  = sma50Arr.length  > 0 ? sma50Arr[sma50Arr.length - 1]   : null
  const sma200Act = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1] : null
  const { linea, signal } = macd(velas)
  const macdAct = linea.length  > 0 ? linea[linea.length - 1]   : null
  const sigAct  = signal.length > 0 ? signal[signal.length - 1] : null

  const hayUrgentes = senales.some(s => s.urgente)
  const header = hayUrgentes
    ? `🚨 *ALERTA URGENTE — ${ticker.symbol}*`
    : `📡 *Señal técnica — ${ticker.symbol}*`

  const lineas = [header]
  if (ticker.nombre && ticker.nombre !== ticker.symbol) lineas.push(`_${ticker.nombre}_`)
  lineas.push('')
  lineas.push('*📊 Estado del mercado*')
  lineas.push(`💰 Precio: *${precio.toFixed(3)}*`)

  if (rsiActual !== null) {
    const zona = rsiActual < (config.umbraRsiSobreventa ?? 30)
      ? '🟢 sobreventa'
      : rsiActual > (100 - (config.umbraRsiSobreventa ?? 30))
        ? '🔴 sobrecompra'
        : '⚪ neutral'
    lineas.push(`📈 RSI (14): *${rsiActual.toFixed(1)}* ${zona}`)
  }

  if (sma50Act !== null)  lineas.push(`〽️ SMA 50: *${sma50Act.toFixed(2)}* — ${precio > sma50Act ? '▲ sobre SMA50' : '▼ bajo SMA50'}`)
  if (sma200Act !== null) lineas.push(`〽️ SMA 200: *${sma200Act.toFixed(2)}* — ${precio > sma200Act ? '▲ sobre SMA200' : '▼ bajo SMA200'}`)
  if (sma50Act && sma200Act) lineas.push(`📌 ${sma50Act > sma200Act ? '⬆️ Tendencia alcista' : '⬇️ Tendencia bajista'} (SMA50 ${sma50Act > sma200Act ? '>' : '<'} SMA200)`)
  if (macdAct !== null && sigAct !== null) lineas.push(`📊 MACD: *${macdAct.toFixed(3)}* | Señal: *${sigAct.toFixed(3)}* — ${macdAct > sigAct ? '🟢 alcista' : '🔴 bajista'}`)
  if (ticker.stop != null)   lineas.push(`🛡️ Stop Loss: *${ticker.stop}*`)
  if (ticker.target != null) lineas.push(`🎯 Take Profit: *${ticker.target}*`)

  lineas.push('')
  lineas.push(`*🔔 Señal${senales.length > 1 ? 'es' : ''} detectada${senales.length > 1 ? 's' : ''} (${senales.length})*`)

  for (const s of senales) {
    lineas.push('')
    lineas.push(`${s.emoji} *${s.titulo}*`)
    lineas.push(s.descripcion)
  }

  if (ticker.nota) {
    lineas.push('')
    lineas.push(`📝 _Nota: ${ticker.nota}_`)
  }

  return lineas.join('\n')
}

async function procesarTicker(tickerDoc, chatId, config, silencioDesde, silencioHasta) {
  const ticker = { id: tickerDoc.id, ...tickerDoc.data() }
  console.log(`    → ${ticker.symbol}`)

  const velas = await obtenerVelas(ticker.symbol)
  if (!velas || velas.length < 30) {
    console.log(`      ✗ Datos insuficientes`)
    return
  }

  const senalesActivas = calcularSenales(velas, ticker, config)
  const estadoPrevio   = ticker.estadoSenales || {}
  const senalesNuevas  = senalesActivas.filter(s => !estadoPrevio[s.id])

  const senalesReseteadas = {}
  for (const id of Object.keys(estadoPrevio)) {
    if (estadoPrevio[id] && !senalesActivas.find(s => s.id === id)) {
      senalesReseteadas[id] = false
    }
  }

  const nuevoEstado = { ...estadoPrevio, ...senalesReseteadas }
  for (const s of senalesActivas) nuevoEstado[s.id] = true

  if (JSON.stringify(nuevoEstado) !== JSON.stringify(estadoPrevio)) {
    await tickerDoc.ref.update({ estadoSenales: nuevoEstado })
  }

  if (senalesNuevas.length === 0) {
    console.log(`      ✓ Sin señales nuevas (${senalesActivas.length} activas, ya notificadas)`)
    return
  }

  console.log(`      ✓ ${senalesNuevas.length} señal(es) nueva(s): ${senalesNuevas.map(s => s.id).join(', ')}`)

  const mensaje = construirMensajeTecnico(ticker, velas, senalesNuevas, config)
  await enviarTelegram(chatId, mensaje, silencioDesde, silencioHasta)

  const updates = {}
  if (senalesNuevas.find(s => s.id === 'toca_stop'))   updates.alertaSobre = null
  if (senalesNuevas.find(s => s.id === 'toca_target'))  updates.alertaBajo  = null
  if (Object.keys(updates).length) await tickerDoc.ref.update(updates)
}

// ── Procesado por usuario ─────────────────────────────────────────────────────

async function procesarUsuario(uid) {
  const configSnap = await db.doc(`users/${uid}/config/principal`).get()
  const config     = configSnap.exists ? configSnap.data() : {}
  const chatId     = config.telegramChatId

  if (!chatId) {
    console.log(`  [INFO] Usuario ${uid} sin chatId — saltando`)
    return
  }

  const silencioDesde = config.silencioDesde ?? 23
  const silencioHasta = config.silencioHasta ?? 7

  console.log(`  [INFO] Usuario ${uid} | RSI umbral: ${config.umbraRsiSobreventa ?? 30} | Silencio: ${silencioDesde}h-${silencioHasta}h`)

  // ── Pasada 1: señales técnicas ─────────────────────────────────────────────
  console.log(`  [Técnicas] Comprobando señales...`)
  const radarSnap = await db.collection(`users/${uid}/radar`).get()
  if (!radarSnap.empty) {
    for (const tickerDoc of radarSnap.docs) {
      try {
        await procesarTicker(tickerDoc, chatId, config, silencioDesde, silencioHasta)
      } catch (err) {
        console.error(`    [ERROR técnico] ${tickerDoc.data()?.symbol}:`, err.message)
      }
    }
  } else {
    console.log(`  [INFO] Radar vacío`)
  }

  // ── Pasada 2: noticias (Sprint 25) ─────────────────────────────────────────
  console.log(`  [Noticias] Comprobando noticias...`)
  try {
    await procesarNoticiasUsuario(uid, chatId, config, silencioDesde, silencioHasta)
  } catch (err) {
    console.error(`  [ERROR noticias]:`, err.message)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[${new Date().toISOString()}] ── Comprobación de alertas ──`)
  const usersSnap = await db.collection('users').get()
  if (usersSnap.empty) { console.log('[INFO] Sin usuarios'); return }
  console.log(`[INFO] ${usersSnap.size} usuario(s)\n`)

  await Promise.allSettled(
    usersSnap.docs.map(async userDoc => {
      try   { await procesarUsuario(userDoc.id) }
      catch (err) { console.error(`[ERROR] ${userDoc.id}:`, err.message) }
    })
  )
  console.log(`\n[${new Date().toISOString()}] ── Finalizado ──\n`)
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1) })
