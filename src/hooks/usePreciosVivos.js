// src/hooks/usePreciosVivos.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook que mantiene precios actualizados automáticamente cada N segundos.
// Llama al servicio yahooFinance.js y re-renderiza el componente cuando
// cambian los precios.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { obtenerPrecios } from '../services/yahooFinance'

/**
 * Hook para obtener y refrescar precios de varios tickers automáticamente.
 *
 * @param {string[]} tickers - Array de símbolos Yahoo Finance a seguir.
 *   Ejemplo: ["SAN.MC", "PEP", "EURUSD=X"]
 * @param {number} intervaloMs - Milisegundos entre refresco (defecto: 30000 = 30s)
 *
 * @returns {{
 *   precios: Object,       — { ticker: precio } con el último precio conocido
 *   cargando: boolean,     — true solo durante la primera carga
 *   error: string|null,    — mensaje de error si algo falla
 *   ultimaActualizacion: Date|null — cuándo se actualizó por última vez
 * }}
 */
export function usePreciosVivos(tickers = [], intervaloMs = 30000) {
  // Estado inicial: precios vacíos
  const [precios, setPrecios] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)

  // Función de refresco extraída para poder llamarla manualmente también
  const refrescar = useCallback(async () => {
    // Si no hay tickers que seguir, no hacemos nada
    if (tickers.length === 0) {
      setCargando(false)
      return
    }

    try {
      const nuevosPrecioes = await obtenerPrecios(tickers)
      setPrecios(nuevosPrecioes)
      setUltimaActualizacion(new Date())
      setError(null)
    } catch (err) {
      setError('Error al obtener precios. Reintentando...')
      console.error('[usePreciosVivos] Error:', err)
    } finally {
      // Tras la primera carga, desactivamos el spinner
      setCargando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(',')]) // Solo recrea la función si cambian los tickers

  useEffect(() => {
    // Carga inmediata al montar el componente
    refrescar()

    // Después, refrescar cada N segundos
    const intervalo = setInterval(refrescar, intervaloMs)

    // Limpieza: cancelar el intervalo cuando el componente se desmonte
    return () => clearInterval(intervalo)
  }, [refrescar, intervaloMs])

  return { precios, cargando, error, ultimaActualizacion, refrescar }
}
