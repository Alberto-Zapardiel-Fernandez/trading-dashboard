// src/hooks/useConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook para la configuración del usuario (fxEurUsd).
// SPRINT 2: El EUR/USD ahora se actualiza automáticamente desde Yahoo Finance
// cada 30 segundos. Si Yahoo falla, usamos el último valor guardado en Firestore.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES } from '../config/constants'
import { obtenerEurUsd } from '../services/yahooFinance'

// Intervalo de refresco del EUR/USD en milisegundos (30 segundos)
const INTERVALO_FX_MS = 30_000

export function useConfig() {
  const { usuario } = useAuth()
  const [config, setConfig] = useState({ fxEurUsd: 1.15 })
  const [cargando, setCargando] = useState(true)

  // Guardamos la referencia del usuario para usarla dentro del intervalo
  // sin que el intervalo se re-cree cada vez que cambia el usuario
  const usuarioRef = useRef(usuario)
  useEffect(() => {
    usuarioRef.current = usuario
  }, [usuario])

  // ── 1. Suscripción a Firestore (igual que antes) ──────────────────────────
  useEffect(() => {
    if (!usuario) return

    const ref = doc(db, 'users', usuario.uid, COLECCIONES.CONFIG, 'principal')
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setConfig(snap.data())
      setCargando(false)
    })

    return unsub
  }, [usuario])

  // ── 2. Actualización automática del EUR/USD desde Yahoo Finance ───────────
  useEffect(() => {
    // Función que obtiene el EUR/USD y actualiza estado + Firestore
    const actualizarFx = async () => {
      const fx = await obtenerEurUsd()

      // Si Yahoo no devuelve nada, no tocamos nada (seguimos con Firestore)
      if (fx === null) {
        console.warn('[useConfig] No se pudo obtener EUR/USD de Yahoo, usando valor guardado')
        return
      }

      // Redondeamos a 4 decimales (ej: 1.0847)
      const fxRedondeado = Math.round(fx * 10000) / 10000

      // Actualizamos el estado local inmediatamente (se ve en pantalla al instante)
      setConfig(prev => ({ ...prev, fxEurUsd: fxRedondeado }))

      // Guardamos en Firestore para que el fallback siempre esté actualizado
      // Usamos usuarioRef.current para no recrear el intervalo por cada cambio de usuario
      const uid = usuarioRef.current?.uid
      if (!uid) return

      try {
        const ref = doc(db, 'users', uid, COLECCIONES.CONFIG, 'principal')
        await setDoc(ref, { fxEurUsd: fxRedondeado }, { merge: true })
        console.log(`[useConfig] EUR/USD actualizado automáticamente: ${fxRedondeado}`)
      } catch (err) {
        // Si falla el guardado en Firestore no es crítico, el estado local ya está bien
        console.error('[useConfig] Error guardando EUR/USD en Firestore:', err)
      }
    }

    // Primera llamada inmediata al montar
    actualizarFx()

    // Después, cada 30 segundos
    const intervalo = setInterval(actualizarFx, INTERVALO_FX_MS)

    // Limpieza al desmontar
    return () => clearInterval(intervalo)
  }, []) // Sin dependencias: este efecto solo se monta una vez

  // ── 3. Función manual (para si el usuario quiere sobreescribir el valor) ──
  const actualizarConfig = async nuevosValores => {
    if (!usuario) return
    const ref = doc(db, 'users', usuario.uid, COLECCIONES.CONFIG, 'principal')
    await setDoc(ref, { ...config, ...nuevosValores }, { merge: true })
  }

  return { config, cargando, actualizarConfig }
}
