// ─────────────────────────────────────────────────────────────────────────────
// Hook para el radar de vigilancia de tickers.
// Gestiona la lista de tickers vigilados en Firestore y calcula su estado
// técnico (RSI, SMA50/200, cruces) con precios en tiempo real de Yahoo.
// Las alertas Telegram solo se envían cuando el estado CAMBIA.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES } from '../config/constants'
import { obtenerVelas } from '../services/yahooFinance'
import { calcularSMA, calcularRSI } from '../services/indicadores'

// ── Configuración Telegram ────────────────────────────────────────────────────
const TELEGRAM_TOKEN = import.meta.env.VITE_TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID

async function enviarTelegram(mensaje) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
        parse_mode: 'Markdown'
      })
    })
  } catch (err) {
    console.error('[Telegram] Error enviando mensaje:', err)
  }
}

// ── Lógica de estado técnico ──────────────────────────────────────────────────

/**
 * Calcula el estado técnico de un ticker a partir de sus velas.
 * Devuelve un objeto con todos los valores y el estado final.
 */
function calcularEstado(velas) {
  if (!velas || velas.length < 15) return null

  const precioActual = velas[velas.length - 1].close

  // RSI
  const rsiArr = calcularRSI(velas, 14)
  const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1].value : null

  // SMA50 y SMA200
  const sma50Arr = calcularSMA(velas, 50)
  const sma200Arr = calcularSMA(velas, 200)
  const sma50 = sma50Arr.length > 0 ? sma50Arr[sma50Arr.length - 1].value : null
  const sma200 = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1].value : null

  // Cruces: comparamos el último y el penúltimo punto donde ambas SMAs existen
  let cruce = null
  if (sma50Arr.length >= 2 && sma200Arr.length >= 2) {
    // Buscamos el punto anterior común
    const sma50Prev = sma50Arr[sma50Arr.length - 2].value
    const sma200Prev = sma200Arr[sma200Arr.length - 2].value

    if (sma50Prev <= sma200Prev && sma50 > sma200) cruce = 'DORADO'
    if (sma50Prev >= sma200Prev && sma50 < sma200) cruce = 'MUERTE'
  }

  // Determinar estado (misma lógica que el Python)
  let estado, color
  if (rsi !== null && rsi < 30) {
    estado = 'SOBREVENTA'
    color = '#26a69a'
  } else if (rsi !== null && rsi > 70) {
    estado = 'SOBRECOMPRA'
    color = '#ef5350'
  } else if (cruce === 'DORADO') {
    estado = 'CRUCE_DORADO'
    color = '#ffa726'
  } else if (cruce === 'MUERTE') {
    estado = 'CRUCE_MUERTE'
    color = '#9c27b0'
  } else {
    estado = 'NEUTRAL'
    color = '#6b7280'
  }

  return { precioActual, rsi, sma50, sma200, cruce, estado, color }
}

// Mensajes de Telegram por estado
const MENSAJES_TELEGRAM = {
  SOBREVENTA: (t, r) => `📉 *${t}* en SOBREVENTA (RSI: ${r?.toFixed(1)}). Posible rebote.`,
  SOBRECOMPRA: (t, r) => `📈 *${t}* en SOBRECOMPRA (RSI: ${r?.toFixed(1)}). Precaución.`,
  CRUCE_DORADO: t => `✨ *${t}* — ¡CRUCE DORADO! Tendencia alcista confirmada.`,
  CRUCE_MUERTE: t => `💀 *${t}* — ¡CRUCE DE LA MUERTE! Posible caída.`
}

// Intervalo de actualización en ms
const INTERVALO_MS = 30_000

export function useRadar() {
  const { usuario } = useAuth()

  // Lista de tickers guardados en Firestore
  const [tickers, setTickers] = useState([])
  // Datos técnicos calculados para cada ticker { [symbol]: { precioActual, rsi, ... } }
  const [datos, setDatos] = useState({})
  const [cargando, setCargando] = useState(true)

  // Memoria de estados anteriores para no repetir alertas Telegram
  const memoriaEstados = useRef({})

  // ── 1. Suscripción a Firestore ────────────────────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const ref = collection(db, 'users', usuario.uid, COLECCIONES.RADAR)
    const unsub = onSnapshot(ref, snap => {
      setTickers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCargando(false)
    })
    return unsub
  }, [usuario])

  // ── 2. Actualización de datos técnicos ───────────────────────────────────
  const actualizarDatos = useCallback(async () => {
    if (tickers.length === 0) return

    const nuevosDatos = {}

    await Promise.allSettled(
      tickers.map(async ticker => {
        const velas = await obtenerVelas(ticker.symbol, '1D')
        if (!velas) return

        const estado = calcularEstado(velas)
        if (!estado) return

        nuevosDatos[ticker.symbol] = estado

        // Alertas Telegram solo si el estado cambia
        const estadoAnterior = memoriaEstados.current[ticker.symbol]
        if (estado.estado !== estadoAnterior && estado.estado !== 'NEUTRAL') {
          const msg = MENSAJES_TELEGRAM[estado.estado]
          if (msg) await enviarTelegram(msg(ticker.symbol, estado.rsi))
          memoriaEstados.current[ticker.symbol] = estado.estado
        }
      })
    )

    setDatos(prev => ({ ...prev, ...nuevosDatos }))
  }, [tickers])

  // Actualización inicial y cada 30 segundos
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    actualizarDatos()
    const intervalo = setInterval(actualizarDatos, INTERVALO_MS)
    return () => clearInterval(intervalo)
  }, [actualizarDatos])

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const añadirTicker = async (symbol, nombre = '', stop = null, target = null) => {
    if (!usuario) return
    const ref = collection(db, 'users', usuario.uid, COLECCIONES.RADAR)
    await addDoc(ref, { symbol: symbol.toUpperCase(), nombre, stop, target })
  }

  const eliminarTicker = async id => {
    if (!usuario) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.RADAR, id))
  }

  const actualizarStopTarget = async (id, stop, target) => {
    if (!usuario) return
    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.RADAR, id), { stop, target })
  }

  return {
    tickers,
    datos,
    cargando,
    añadirTicker,
    eliminarTicker,
    actualizarStopTarget
  }
}
