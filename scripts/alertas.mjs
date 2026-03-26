// scripts/alertas.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Motor de alertas técnicas — ejecutado cada 30 min por GitHub Actions.
//
// ARQUITECTURA:
//   Cada ticker pasa por un motor de señales independientes. Cada señal
//   tiene su propio anti-spam en Firestore (campo ultimaAlerta_*) para
//   no repetir la misma alerta mientras la condición persiste.
//
// SEÑALES IMPLEMENTADAS:
//   · RSI sobreventa / sobrecompra  (umbral configurable por usuario)
//   · Cruce dorado / cruce de muerte (SMA50 vs SMA200)
//   · Precio cruza SMA200 (arriba o abajo)
//   · MACD cruza señal (alcista o bajista)  — activable en config
//   · Volumen anómalo (>2x media 20 días)   — activable en config
//   · Precio toca Stop Loss o Take Profit del Radar
//
// ANTI-SPAM:
//   Cada señal guarda su último estado en Firestore. Solo alerta cuando
//   la condición cambia (entra o sale de zona). Si el RSI lleva 10 días
//   en sobreventa, solo alerta el primer día.
//
// CONFIGURACIÓN (leída de users/{uid}/config/principal):
//   umbraRsiSobreventa   number  20-40  (default 30)
//   alertasMacd          bool           (default true)
//   alertasVolumen       bool           (default true)
//   alertasCrucesSma     bool           (default true)
//   silencioDesde        number  0-23   (default 23)
//   silencioHasta        number  0-23   (default 7)
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore }        from 'firebase-admin/firestore'

// ── Inicialización ────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.VITE_TELEGRAM_TOKEN
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ── Horario de silencio ───────────────────────────────────────────────────────

function esHorarioSilencio(desde = 23, hasta = 7) {
  const h = new Date().getUTCHours()
  // Franja nocturna puede cruzar medianoche (ej: 23 → 7)
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
    const ts  = chart.timestamp
    const q   = chart.indicators.quote[0]
    return ts
      .map((t, i) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] }))
      .filter(v => v.close != null)
  } catch (err) {
    console.error(`    [Yahoo] Error ${symbol}:`, err.message)
    return null
  }
}

// ── Indicadores técnicos ──────────────────────────────────────────────────────

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
  // MACD = EMA12 - EMA26 | Señal = EMA9 del MACD | Histograma = MACD - Señal
  const e12 = ema(velas, 12)
  const e26 = ema(velas, 26)
  if (e12.length < 26 || e26.length < 1) return { linea: [], signal: [], hist: [] }
  // Alinear: e26 empieza 14 velas más tarde que e12
  const offset   = e12.length - e26.length
  const macdLine = e26.map((v, i) => e12[i + offset] - v)

  // Señal = EMA9 del MACD — calculada manualmente sobre el array
  const k   = 2 / (9 + 1)
  let sv    = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9
  const sig = [sv]
  for (let i = 9; i < macdLine.length; i++) {
    sv = macdLine[i] * k + sv * (1 - k)
    sig.push(sv)
  }
  const off2 = macdLine.length - sig.length
  const hist  = sig.map((s, i) => macdLine[i + off2] - s)
  return {
    linea:  macdLine.slice(off2),
    signal: sig,
    hist
  }
}

function volumenMedio(velas, n = 20) {
  if (velas.length < n) return null
  return velas.slice(-n).reduce((a, v) => a + (v.volume || 0), 0) / n
}

// ── Motor de señales ──────────────────────────────────────────────────────────
// Devuelve un array de señales activas, cada una con:
//   { id, emoji, titulo, descripcion, urgente }

function calcularSenales(velas, ticker, config) {
  const senales = []
  if (!velas || velas.length < 30) return senales

  const n         = velas.length
  const precio    = velas[n - 1].close
  const umbraRsi  = config.umbraRsiSobreventa ?? 30

  // ── RSI ────────────────────────────────────────────────────────────────────
  const rsiArr    = rsi(velas, 14)
  const rsiActual = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : null
  const rsiPrev   = rsiArr.length > 1 ? rsiArr[rsiArr.length - 2] : null

  if (rsiActual !== null) {
    if (rsiActual < umbraRsi) {
      senales.push({
        id:          'rsi_sobreventa',
        emoji:       '📉',
        titulo:      `RSI en SOBREVENTA`,
        descripcion: `RSI (14) = *${rsiActual.toFixed(1)}* — por debajo del umbral de ${umbraRsi}.\nPosible agotamiento bajista y rebote técnico.`,
        urgente:     false
      })
    } else if (rsiActual > (100 - umbraRsi)) {
      senales.push({
        id:          'rsi_sobrecompra',
        emoji:       '📈',
        titulo:      `RSI en SOBRECOMPRA`,
        descripcion: `RSI (14) = *${rsiActual.toFixed(1)}* — por encima de ${100 - umbraRsi}.\nPrecaución: posible corrección a corto plazo.`,
        urgente:     false
      })
    }
  }

  // ── SMA50 / SMA200 ─────────────────────────────────────────────────────────
  const sma50Arr  = sma(velas, 50)
  const sma200Arr = sma(velas, 200)

  const sma50Actual  = sma50Arr.length  > 0 ? sma50Arr[sma50Arr.length - 1]   : null
  const sma50Prev    = sma50Arr.length  > 1 ? sma50Arr[sma50Arr.length - 2]   : null
  const sma200Actual = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1] : null
  const sma200Prev   = sma200Arr.length > 1 ? sma200Arr[sma200Arr.length - 2] : null

  if (config.alertasCrucesSma !== false && sma50Actual && sma200Actual && sma50Prev && sma200Prev) {
    // Cruce dorado: SMA50 cruza SMA200 hacia arriba
    if (sma50Prev <= sma200Prev && sma50Actual > sma200Actual) {
      senales.push({
        id:          'cruce_dorado',
        emoji:       '✨',
        titulo:      'CRUCE DORADO',
        descripcion: `SMA50 (*${sma50Actual.toFixed(2)}*) ha cruzado por encima de SMA200 (*${sma200Actual.toFixed(2)}*).\nSeñal alcista de largo plazo — alta fiabilidad.`,
        urgente:     true
      })
    }
    // Cruce de la muerte: SMA50 cruza SMA200 hacia abajo
    if (sma50Prev >= sma200Prev && sma50Actual < sma200Actual) {
      senales.push({
        id:          'cruce_muerte',
        emoji:       '💀',
        titulo:      'CRUCE DE LA MUERTE',
        descripcion: `SMA50 (*${sma50Actual.toFixed(2)}*) ha cruzado por debajo de SMA200 (*${sma200Actual.toFixed(2)}*).\nSeñal bajista de largo plazo — considerar salida.`,
        urgente:     true
      })
    }
  }

  // Precio cruza SMA200 (evento relevante aunque no sea cruce entre medias)
  if (config.alertasCrucesSma !== false && sma200Actual && sma200Prev) {
    const precioPrev = velas[n - 2]?.close
    if (precioPrev && precioPrev < sma200Prev && precio > sma200Actual) {
      senales.push({
        id:          'precio_sobre_sma200',
        emoji:       '🟢',
        titulo:      'Precio recupera SMA200',
        descripcion: `El precio (*${precio.toFixed(3)}*) ha cruzado por encima de la SMA200 (*${sma200Actual.toFixed(2)}*).\nZona de soporte clave recuperada.`,
        urgente:     false
      })
    }
    if (precioPrev && precioPrev > sma200Prev && precio < sma200Actual) {
      senales.push({
        id:          'precio_bajo_sma200',
        emoji:       '🔴',
        titulo:      'Precio pierde SMA200',
        descripcion: `El precio (*${precio.toFixed(3)}*) ha caído por debajo de la SMA200 (*${sma200Actual.toFixed(2)}*).\nPérdida de soporte clave — zona de riesgo.`,
        urgente:     false
      })
    }
  }

  // ── MACD ───────────────────────────────────────────────────────────────────
  if (config.alertasMacd !== false) {
    const { linea, signal, hist } = macd(velas)
    if (hist.length >= 2) {
      const histActual = hist[hist.length - 1]
      const histPrev   = hist[hist.length - 2]
      const macdActual = linea[linea.length - 1]
      const sigActual  = signal[signal.length - 1]

      // Cruce alcista: histograma pasa de negativo a positivo
      if (histPrev < 0 && histActual > 0) {
        senales.push({
          id:          'macd_alcista',
          emoji:       '📊',
          titulo:      'MACD — Cruce alcista',
          descripcion: `MACD (*${macdActual.toFixed(3)}*) ha cruzado por encima de la señal (*${sigActual.toFixed(3)}*).\nEl histograma es positivo — momentum alcista.`,
          urgente:     false
        })
      }
      // Cruce bajista: histograma pasa de positivo a negativo
      if (histPrev > 0 && histActual < 0) {
        senales.push({
          id:          'macd_bajista',
          emoji:       '📊',
          titulo:      'MACD — Cruce bajista',
          descripcion: `MACD (*${macdActual.toFixed(3)}*) ha cruzado por debajo de la señal (*${sigActual.toFixed(3)}*).\nEl histograma es negativo — momentum bajista.`,
          urgente:     false
        })
      }
    }
  }

  // ── Volumen anómalo ────────────────────────────────────────────────────────
  if (config.alertasVolumen !== false) {
    const volActual = velas[n - 1].volume
    const volMedio  = volumenMedio(velas, 20)
    if (volActual && volMedio && volActual > volMedio * 2) {
      const veces = (volActual / volMedio).toFixed(1)
      senales.push({
        id:          'volumen_anomalo',
        emoji:       '🔊',
        titulo:      `Volumen anómalo (×${veces})`,
        descripcion: `Volumen de hoy (*${(volActual / 1e6).toFixed(1)}M*) es ${veces}x superior a la media de 20 días (*${(volMedio / 1e6).toFixed(1)}M*).\nMovimiento institucional posible — confirma con precio.`,
        urgente:     false
      })
    }
  }

  // ── Stop Loss y Take Profit del Radar ──────────────────────────────────────
  if (ticker.stop != null && precio <= ticker.stop) {
    const pct = (((ticker.stop - precio) / precio) * 100).toFixed(2)
    senales.push({
      id:          'toca_stop',
      emoji:       '🛑',
      titulo:      'Precio en zona de Stop Loss',
      descripcion: `El precio (*${precio.toFixed(3)}*) ha tocado o superado el Stop Loss (*${ticker.stop}*).\nDistancia: *-${pct}%* — revisa la posición.`,
      urgente:     true
    })
  }

  if (ticker.target != null && precio >= ticker.target) {
    const pct = ((( precio - ticker.target) / precio) * 100).toFixed(2)
    senales.push({
      id:          'toca_target',
      emoji:       '🎯',
      titulo:      'Precio alcanza Take Profit',
      descripcion: `El precio (*${precio.toFixed(3)}*) ha alcanzado el Take Profit (*${ticker.target}*).\nDistancia: *+${pct}%* — considera realizar beneficios.`,
      urgente:     true
    })
  }

  return senales
}

// ── Construcción del mensaje Telegram ─────────────────────────────────────────

function construirMensaje(ticker, velas, senales, config) {
  const n          = velas.length
  const precio     = velas[n - 1].close
  const rsiArr     = rsi(velas, 14)
  const sma50Arr   = sma(velas, 50)
  const sma200Arr  = sma(velas, 200)
  const rsiActual  = rsiArr.length    > 0 ? rsiArr[rsiArr.length - 1]       : null
  const sma50Act   = sma50Arr.length  > 0 ? sma50Arr[sma50Arr.length - 1]   : null
  const sma200Act  = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1] : null

  const { linea, signal } = macd(velas)
  const macdAct  = linea.length  > 0 ? linea[linea.length - 1]   : null
  const sigAct   = signal.length > 0 ? signal[signal.length - 1] : null

  const hayUrgentes = senales.some(s => s.urgente)
  const header = hayUrgentes
    ? `🚨 *ALERTA URGENTE — ${ticker.symbol}*`
    : `📡 *Señal técnica — ${ticker.symbol}*`

  const lineas = [header]
  if (ticker.nombre && ticker.nombre !== ticker.symbol) lineas.push(`_${ticker.nombre}_`)
  lineas.push('')

  // ── Snapshot de mercado ────────────────────────────────────────────────────
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

  if (sma50Act !== null) {
    const rel50 = precio > sma50Act ? '▲ sobre SMA50' : '▼ bajo SMA50'
    lineas.push(`〽️ SMA 50: *${sma50Act.toFixed(2)}* — ${rel50}`)
  }

  if (sma200Act !== null) {
    const rel200 = precio > sma200Act ? '▲ sobre SMA200' : '▼ bajo SMA200'
    lineas.push(`〽️ SMA 200: *${sma200Act.toFixed(2)}* — ${rel200}`)
  }

  if (sma50Act && sma200Act) {
    const tend = sma50Act > sma200Act ? '⬆️ Tendencia alcista' : '⬇️ Tendencia bajista'
    lineas.push(`📌 ${tend} (SMA50 ${sma50Act > sma200Act ? '>' : '<'} SMA200)`)
  }

  if (macdAct !== null && sigAct !== null) {
    const momentum = macdAct > sigAct ? '🟢 alcista' : '🔴 bajista'
    lineas.push(`📊 MACD: *${macdAct.toFixed(3)}* | Señal: *${sigAct.toFixed(3)}* — ${momentum}`)
  }

  if (ticker.stop != null)   lineas.push(`🛡️ Stop Loss: *${ticker.stop}*`)
  if (ticker.target != null) lineas.push(`🎯 Take Profit: *${ticker.target}*`)

  // ── Señales detectadas ─────────────────────────────────────────────────────
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

// ── Procesado por ticker ──────────────────────────────────────────────────────

async function procesarTicker(tickerDoc, chatId, config, silencioDesde, silencioHasta) {
  const ticker = { id: tickerDoc.id, ...tickerDoc.data() }
  console.log(`    → ${ticker.symbol}`)

  const velas = await obtenerVelas(ticker.symbol)
  if (!velas || velas.length < 30) {
    console.log(`      ✗ Datos insuficientes`)
    return
  }

  const senalesActivas = calcularSenales(velas, ticker, config)

  // Estado persistido en Firestore — qué señales ya estaban activas
  const estadoPrevio = ticker.estadoSenales || {}

  // Filtramos: solo enviamos señales NUEVAS (que no estaban activas antes)
  // Una señal se considera "nueva" cuando su id no está en estadoPrevio
  // o cuando estadoPrevio[id] era false/null y ahora es true
  const senalesNuevas = senalesActivas.filter(s => !estadoPrevio[s.id])

  // Señales que ya no están activas → las marcamos como false para reset
  const senalesReseteadas = {}
  for (const id of Object.keys(estadoPrevio)) {
    if (estadoPrevio[id] && !senalesActivas.find(s => s.id === id)) {
      senalesReseteadas[id] = false
    }
  }

  // Persistir el nuevo estado (activas + reseteadas)
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

  const mensaje = construirMensaje(ticker, velas, senalesNuevas, config)
  await enviarTelegram(chatId, mensaje, silencioDesde, silencioHasta)

  // ── Desactivar alertas de precio tras dispararse ───────────────────────────
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

  const radarSnap = await db.collection(`users/${uid}/radar`).get()
  if (radarSnap.empty) { console.log(`  [INFO] Radar vacío`); return }

  for (const tickerDoc of radarSnap.docs) {
    try {
      await procesarTicker(tickerDoc, chatId, config, silencioDesde, silencioHasta)
    } catch (err) {
      console.error(`    [ERROR] ${tickerDoc.data()?.symbol}:`, err.message)
    }
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
