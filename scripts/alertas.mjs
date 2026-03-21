// scripts/alertas.mjs
// Script de servidor que comprueba las alertas del Radar para todos los usuarios.
// Se ejecuta cada 30 minutos en GitHub Actions — funciona aunque la app esté cerrada.
//
// Diferencias respecto al hook useRadar del frontend:
// - Usa Firebase Admin SDK (acceso directo a Firestore sin autenticación de usuario)
// - Llama a Yahoo Finance directamente sin CORS proxy (no hay restricciones en servidor)
// - Guarda el último estado alertado en Firestore para no repetir alertas
// - No incluye el mensaje de buenos días (ese sigue siendo responsabilidad del frontend)

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// ── Configuración ─────────────────────────────────────────────────────────────

const TELEGRAM_TOKEN = process.env.VITE_TELEGRAM_TOKEN

// La cuenta de servicio viene como JSON en la variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

// Inicializar Firebase Admin — bypasea las reglas de seguridad de Firestore
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

// ── Utilidades de tiempo ──────────────────────────────────────────────────────

function esHorarioNocturno() {
  // Convertimos UTC a hora de España aproximada (UTC+1 en invierno, UTC+2 en verano)
  // Usamos un margen amplio: silencio entre 23:00 y 07:00 UTC cubre ambas franjas
  const horaUtc = new Date().getUTCHours()
  return horaUtc >= 23 || horaUtc < 6
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function enviarTelegram(chatId, mensaje) {
  if (!chatId || !TELEGRAM_TOKEN) return
  if (esHorarioNocturno()) {
    console.log(`[Telegram] Silencio nocturno — mensaje no enviado a ${chatId}`)
    return
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: 'Markdown' })
    })
    const data = await res.json()
    if (!data.ok) console.error('[Telegram] Error en respuesta:', data)
  } catch (err) {
    console.error('[Telegram] Error de red:', err)
  }
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────
// En Node.js no hay restricciones CORS — llamamos directamente sin proxy

async function obtenerVelas(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) return null

    const data = await res.json()
    const chart = data?.chart?.result?.[0]
    if (!chart) return null

    const timestamps = chart.timestamp
    const quotes = chart.indicators.quote[0]

    // Filtramos velas con datos nulos (días festivos, etc.)
    return timestamps
      .map((t, i) => ({
        time: t,
        open: quotes.open[i],
        high: quotes.high[i],
        low: quotes.low[i],
        close: quotes.close[i],
        volume: quotes.volume[i]
      }))
      .filter(v => v.close !== null && v.close !== undefined)
  } catch (err) {
    console.error(`[Yahoo] Error obteniendo velas de ${symbol}:`, err)
    return null
  }
}

// ── Indicadores técnicos ──────────────────────────────────────────────────────
// Misma lógica que src/services/indicadores.js pero en módulo de servidor

function calcularSMA(velas, periodo) {
  const resultado = []
  for (let i = periodo - 1; i < velas.length; i++) {
    const suma = velas.slice(i - periodo + 1, i + 1).reduce((acc, v) => acc + v.close, 0)
    resultado.push({ value: suma / periodo })
  }
  return resultado
}

function calcularRSI(velas, periodo = 14) {
  if (velas.length < periodo + 1) return []

  const cambios = velas.slice(1).map((v, i) => v.close - velas[i].close)

  // Media inicial de ganancias y pérdidas
  let ganancias =
    cambios
      .slice(0, periodo)
      .filter(c => c > 0)
      .reduce((a, b) => a + b, 0) / periodo
  let perdidas =
    Math.abs(
      cambios
        .slice(0, periodo)
        .filter(c => c < 0)
        .reduce((a, b) => a + b, 0)
    ) / periodo

  const resultado = []
  for (let i = periodo; i < cambios.length; i++) {
    const cambio = cambios[i]
    // Media exponencial suavizada (Wilder)
    ganancias = (ganancias * (periodo - 1) + Math.max(cambio, 0)) / periodo
    perdidas = (perdidas * (periodo - 1) + Math.abs(Math.min(cambio, 0))) / periodo
    const rs = perdidas === 0 ? 100 : ganancias / perdidas
    resultado.push({ value: 100 - 100 / (1 + rs) })
  }
  return resultado
}

// ── Estado técnico ────────────────────────────────────────────────────────────

function calcularEstado(velas) {
  if (!velas || velas.length < 15) return null

  const precioActual = velas[velas.length - 1].close
  const rsiArr = calcularRSI(velas, 14)
  const sma50Arr = calcularSMA(velas, 50)
  const sma200Arr = calcularSMA(velas, 200)

  const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1].value : null
  const sma50 = sma50Arr.length > 0 ? sma50Arr[sma50Arr.length - 1].value : null
  const sma200 = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1].value : null

  // Detección de cruce dorado / muerte
  let cruce = null
  if (sma50Arr.length >= 2 && sma200Arr.length >= 2) {
    const sma50Prev = sma50Arr[sma50Arr.length - 2].value
    const sma200Prev = sma200Arr[sma200Arr.length - 2].value
    if (sma50Prev <= sma200Prev && sma50 > sma200) cruce = 'DORADO'
    if (sma50Prev >= sma200Prev && sma50 < sma200) cruce = 'MUERTE'
  }

  let estado
  if (rsi !== null && rsi < 30) estado = 'SOBREVENTA'
  else if (rsi !== null && rsi > 70) estado = 'SOBRECOMPRA'
  else if (cruce === 'DORADO') estado = 'CRUCE_DORADO'
  else if (cruce === 'MUERTE') estado = 'CRUCE_MUERTE'
  else estado = 'NEUTRAL'

  return { precioActual, rsi, sma50, sma200, estado }
}

const MENSAJES_ESTADO = {
  SOBREVENTA: (t, r) => `📉 *${t}* en SOBREVENTA (RSI: ${r?.toFixed(1)}). Posible rebote.`,
  SOBRECOMPRA: (t, r) => `📈 *${t}* en SOBRECOMPRA (RSI: ${r?.toFixed(1)}). Precaución.`,
  CRUCE_DORADO: t => `✨ *${t}* — ¡CRUCE DORADO! Tendencia alcista confirmada.`,
  CRUCE_MUERTE: t => `💀 *${t}* — ¡CRUCE DE LA MUERTE! Posible caída.`
}

// ── Procesado por usuario ─────────────────────────────────────────────────────

async function procesarUsuario(uid) {
  // Obtenemos el chatId de Telegram del usuario desde su config en Firestore
  const configSnap = await db.doc(`users/${uid}/config/principal`).get()
  const chatId = configSnap.data()?.telegramChatId
  if (!chatId) {
    console.log(`[INFO] Usuario ${uid} sin chatId configurado — saltando`)
    return
  }

  // Obtenemos todos sus tickers del Radar
  const radarSnap = await db.collection(`users/${uid}/radar`).get()
  if (radarSnap.empty) return

  console.log(`[INFO] Procesando ${radarSnap.size} tickers para usuario ${uid}`)

  for (const tickerDoc of radarSnap.docs) {
    const ticker = { id: tickerDoc.id, ...tickerDoc.data() }
    console.log(`  → ${ticker.symbol}`)

    const velas = await obtenerVelas(ticker.symbol)
    if (!velas) {
      console.log(`  ✗ Sin datos para ${ticker.symbol}`)
      continue
    }

    const estado = calcularEstado(velas)
    if (!estado) continue

    const precio = estado.precioActual

    // ── Alerta de estado técnico ───────────────────────────────────────────
    // Guardamos 'estadoAlerta' en Firestore para no repetir la misma alerta
    const estadoAnterior = ticker.estadoAlerta || null

    if (estado.estado !== 'NEUTRAL' && estado.estado !== estadoAnterior) {
      // Estado nuevo y relevante — alertamos
      const msg = MENSAJES_ESTADO[estado.estado]
      if (msg) {
        await enviarTelegram(chatId, msg(ticker.symbol, estado.rsi))
        console.log(`  ✓ Alerta ${estado.estado} enviada para ${ticker.symbol}`)
      }
      // Guardamos el estado para no volver a alertar hasta que cambie
      await tickerDoc.ref.update({ estadoAlerta: estado.estado })
    } else if (estado.estado === 'NEUTRAL' && estadoAnterior && estadoAnterior !== 'NEUTRAL') {
      // Volvió a neutral — reseteamos para que la próxima señal sí alerte
      await tickerDoc.ref.update({ estadoAlerta: 'NEUTRAL' })
    }

    // ── Alerta precio ≥ nivel (alertaSobre) ───────────────────────────────
    if (ticker.alertaSobre != null && precio >= ticker.alertaSobre) {
      const msg = `🔔 *${ticker.symbol}* ha superado el nivel *${ticker.alertaSobre}*\nPrecio actual: *${precio.toFixed(2)}*`
      await enviarTelegram(chatId, msg)
      // Desactivamos la alerta tras dispararse para no repetir
      await tickerDoc.ref.update({ alertaSobre: null })
      console.log(`  ✓ AlertaSobre disparada para ${ticker.symbol}`)
    }

    // ── Alerta precio ≤ nivel (alertaBajo) ────────────────────────────────
    if (ticker.alertaBajo != null && precio <= ticker.alertaBajo) {
      const msg = `🔔 *${ticker.symbol}* ha bajado del nivel *${ticker.alertaBajo}*\nPrecio actual: *${precio.toFixed(2)}*`
      await enviarTelegram(chatId, msg)
      await tickerDoc.ref.update({ alertaBajo: null })
      console.log(`  ✓ AlertaBajo disparada para ${ticker.symbol}`)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[${new Date().toISOString()}] ── Iniciando comprobación de alertas ──`)

  // Obtenemos todos los usuarios (documentos en users/)
  // El ID de cada documento es el UID del usuario
  const usersSnap = await db.collection('users').get()

  if (usersSnap.empty) {
    console.log('[INFO] No hay usuarios registrados')
    return
  }

  console.log(`[INFO] ${usersSnap.size} usuario(s) encontrado(s)`)

  // Procesamos cada usuario en paralelo
  await Promise.allSettled(
    usersSnap.docs.map(async userDoc => {
      try {
        await procesarUsuario(userDoc.id)
      } catch (err) {
        console.error(`[ERROR] Usuario ${userDoc.id}:`, err.message)
      }
    })
  )

  console.log(`[${new Date().toISOString()}] ── Comprobación finalizada ──\n`)
}

main().catch(err => {
  console.error('[FATAL]', err)
  process.exit(1)
})
