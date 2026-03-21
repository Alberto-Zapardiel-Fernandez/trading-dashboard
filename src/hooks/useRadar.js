// src/hooks/useRadar.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook para el radar de vigilancia de tickers.
// - Chat ID por usuario (guardado en Firestore/config)
// - Silencio nocturno entre 00:00 y 08:00
// - Mensaje de buenos días a las 08:00 con resumen de cartera y mercado
// - Alertas solo cuando cambia el estado técnico
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { useConfig } from './useConfig'
import { COLECCIONES } from '../config/constants'
import { obtenerVelas, obtenerPrecio } from '../services/yahooFinance'
import { calcularSMA, calcularRSI } from '../services/indicadores'

const TELEGRAM_TOKEN = import.meta.env.VITE_TELEGRAM_TOKEN
const INTERVALO_MS = 30_000

// ── Utilidades de tiempo ──────────────────────────────────────────────────────

function esHorarioNocturno() {
  const hora = new Date().getHours()
  return hora >= 0 && hora < 8
}

function esHoraBuenosDias() {
  const ahora = new Date()
  return ahora.getHours() === 8 && ahora.getMinutes() === 0
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function enviarTelegram(chatId, mensaje) {
  if (!chatId || !TELEGRAM_TOKEN) return
  if (esHorarioNocturno()) {
    console.log('[Telegram] Silencio nocturno, mensaje no enviado')
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensaje,
        parse_mode: 'Markdown'
      })
    })
  } catch (err) {
    console.error('[Telegram] Error:', err)
  }
}

// ── Lógica de estado técnico ──────────────────────────────────────────────────

function calcularEstado(velas) {
  if (!velas || velas.length < 15) return null

  const precioActual = velas[velas.length - 1].close
  const rsiArr = calcularRSI(velas, 14)
  const sma50Arr = calcularSMA(velas, 50)
  const sma200Arr = calcularSMA(velas, 200)

  const rsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1].value : null
  const sma50 = sma50Arr.length > 0 ? sma50Arr[sma50Arr.length - 1].value : null
  const sma200 = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1].value : null

  let cruce = null
  if (sma50Arr.length >= 2 && sma200Arr.length >= 2) {
    const sma50Prev = sma50Arr[sma50Arr.length - 2].value
    const sma200Prev = sma200Arr[sma200Arr.length - 2].value
    if (sma50Prev <= sma200Prev && sma50 > sma200) cruce = 'DORADO'
    if (sma50Prev >= sma200Prev && sma50 < sma200) cruce = 'MUERTE'
  }

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

const MENSAJES_ESTADO = {
  SOBREVENTA: (t, r) => `📉 *${t}* en SOBREVENTA (RSI: ${r?.toFixed(1)}). Posible rebote.`,
  SOBRECOMPRA: (t, r) => `📈 *${t}* en SOBRECOMPRA (RSI: ${r?.toFixed(1)}). Precaución.`,
  CRUCE_DORADO: t => `✨ *${t}* — ¡CRUCE DORADO! Tendencia alcista confirmada.`,
  CRUCE_MUERTE: t => `💀 *${t}* — ¡CRUCE DE LA MUERTE! Posible caída.`
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useRadar() {
  const { usuario } = useAuth()
  const { config } = useConfig()
  const [tickers, setTickers] = useState([])
  const [datos, setDatos] = useState({})
  const [cargando, setCargando] = useState(true)

  const memoriaEstados = useRef({})
  const buenosDiasEnviado = useRef(false)
  // Guardamos los datos en un ref para acceder a ellos dentro del intervalo
  const datosRef = useRef({})

  const chatId = config?.telegramChatId || ''

  // ── Suscripción Firestore ─────────────────────────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const ref = collection(db, 'users', usuario.uid, COLECCIONES.RADAR)
    const unsub = onSnapshot(ref, snap => {
      setTickers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCargando(false)
    })
    return unsub
  }, [usuario])

  // Mantenemos datosRef sincronizado con el estado
  useEffect(() => {
    datosRef.current = datos
  }, [datos])

  // ── Intervalo de actualización ────────────────────────────────────────────
  useEffect(() => {
    console.log('[Radar] useEffect tickers:', tickers.length, '| chatId:', chatId)
    if (tickers.length === 0) return

    const actualizarDatos = async () => {
      // ── Buenos días ──────────────────────────────────────────────────────
      if (esHoraBuenosDias() && !buenosDiasEnviado.current && chatId) {
        buenosDiasEnviado.current = true

        const sp500 = await obtenerPrecio('^GSPC')

        const lineasCartera = tickers
          .map(t => {
            const d = datosRef.current[t.symbol]
            return `🔹 *${t.symbol}*: ${d?.precioActual?.toFixed(2) ?? '...'}`
          })
          .join('\n')

        const fecha = new Date().toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })

        const mensaje = [
          `☀️ *Trading Dashboard — Buenos días*`,
          `📅 ${fecha}`,
          ``,
          `📊 *Radar activo:*`,
          lineasCartera,
          ``,
          `🌎 *Mercado:*`,
          sp500 ? `🇺🇸 S&P 500: ${sp500.toFixed(2)} pts` : `🇺🇸 S&P 500: sin datos`,
          ``,
          `🚀 Radar vigilando ${tickers.length} tickers.`
        ].join('\n')

        await enviarTelegram(chatId, mensaje)
      }

      // Resetear flag a las 09:00 para el día siguiente
      if (new Date().getHours() === 9) buenosDiasEnviado.current = false

      // ── Actualización técnica ─────────────────────────────────────────
      const nuevosDatos = {}
      await Promise.allSettled(
        tickers.map(async ticker => {
          const velas = await obtenerVelas(ticker.symbol, '1D')
          if (!velas) return

          const estado = calcularEstado(velas)
          if (!estado) return

          nuevosDatos[ticker.symbol] = estado
          const anterior = memoriaEstados.current[ticker.symbol]
          if (estado.estado !== anterior && estado.estado !== 'NEUTRAL' && chatId) {
            const msg = MENSAJES_ESTADO[estado.estado]
            if (msg) await enviarTelegram(chatId, msg(ticker.symbol, estado.rsi))
            memoriaEstados.current[ticker.symbol] = estado.estado
          }
        })
      )

      setDatos(prev => ({ ...prev, ...nuevosDatos }))
    }

    actualizarDatos()
    const intervalo = setInterval(actualizarDatos, INTERVALO_MS)
    return () => clearInterval(intervalo)
  }, [tickers, chatId])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const añadirTicker = async (symbol, nombre = '', stop = null, target = null) => {
    if (!usuario) return
    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.RADAR), {
      symbol: symbol.toUpperCase(),
      nombre,
      stop,
      target
    })
  }

  const eliminarTicker = async id => {
    if (!usuario) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.RADAR, id))
  }

  const actualizarStopTarget = async (id, stop, target) => {
    if (!usuario) return
    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.RADAR, id), { stop, target })
  }

  return { tickers, datos, cargando, añadirTicker, eliminarTicker, actualizarStopTarget }
}
