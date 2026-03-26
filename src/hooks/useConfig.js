// src/hooks/useConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook para la configuración del usuario.
// Los campos nuevos tienen defaults para retrocompatibilidad — si el documento
// de Firestore no los tiene, se usan los valores por defecto aquí definidos.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES } from '../config/constants'
import { obtenerEurUsd } from '../services/yahooFinance'

const INTERVALO_FX_MS = 30_000

// Valores por defecto de toda la configuración
// Si el documento de Firestore no tiene un campo, se usa este valor
const CONFIG_DEFAULT = {
  fxEurUsd: 1.15,
  telegramChatId: '',
  // Alertas del radar
  umbraRsiSobreventa: 30, // RSI < este valor → sobreventa
  alertasCrucesSma: true, // cruce dorado / muerte + precio vs SMA200
  alertasMacd: true, // cruce de MACD sobre señal
  alertasVolumen: true, // volumen > 2x media 20 días
  silencioDesde: 23, // hora UTC inicio silencio nocturno
  silencioHasta: 7 // hora UTC fin silencio nocturno
}

export function useConfig() {
  const { usuario } = useAuth()
  const [config, setConfig] = useState(CONFIG_DEFAULT)
  const [cargando, setCargando] = useState(true)

  const usuarioRef = useRef(usuario)
  useEffect(() => {
    usuarioRef.current = usuario
  }, [usuario])

  // ── 1. Suscripción Firestore ───────────────────────────────────────────────
  // Mezclamos CONFIG_DEFAULT con los datos de Firestore para que los campos
  // nuevos siempre tengan un valor aunque el documento sea legacy
  useEffect(() => {
    if (!usuario) return
    const ref = doc(db, 'users', usuario.uid, COLECCIONES.CONFIG, 'principal')
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        setConfig({ ...CONFIG_DEFAULT, ...snap.data() })
      }
      setCargando(false)
    })
    return unsub
  }, [usuario])

  // ── 2. Actualización automática EUR/USD ───────────────────────────────────
  useEffect(() => {
    const actualizarFx = async () => {
      const fx = await obtenerEurUsd()
      if (fx === null) return
      const fxRedondeado = Math.round(fx * 10000) / 10000
      setConfig(prev => ({ ...prev, fxEurUsd: fxRedondeado }))
      const uid = usuarioRef.current?.uid
      if (!uid) return
      try {
        const ref = doc(db, 'users', uid, COLECCIONES.CONFIG, 'principal')
        await setDoc(ref, { fxEurUsd: fxRedondeado }, { merge: true })
      } catch (err) {
        console.error('[useConfig] Error guardando EUR/USD:', err)
      }
    }
    actualizarFx()
    const intervalo = setInterval(actualizarFx, INTERVALO_FX_MS)
    return () => clearInterval(intervalo)
  }, [])

  // ── 3. Guardar cualquier campo ────────────────────────────────────────────
  const actualizarConfig = async nuevosValores => {
    if (!usuario) return
    const ref = doc(db, 'users', usuario.uid, COLECCIONES.CONFIG, 'principal')
    await setDoc(ref, { ...config, ...nuevosValores }, { merge: true })
  }

  return { config, cargando, actualizarConfig }
}
