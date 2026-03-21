// ============================================================
// ModoPrivadoProvider.jsx — componente que provee el contexto
// ============================================================

import { useState, useCallback } from 'react'
import { ModoPrivadoContext, MASCARA } from './ModoPrivadoContext'

export function ModoPrivadoProvider({ children }) {
  // Estado inicial desde localStorage — sobrevive recargas
  const [modoPrivado, setModoPrivado] = useState(() => localStorage.getItem('modoPrivado') === 'true')

  // Alterna el modo y lo persiste en localStorage
  const toggleModoPrivado = useCallback(() => {
    setModoPrivado(prev => {
      const nuevo = !prev
      localStorage.setItem('modoPrivado', String(nuevo))
      return nuevo
    })
  }, [])

  // ocultar(valor): devuelve '••••' en modo privado, o el valor tal cual
  const ocultar = useCallback(valor => (modoPrivado ? MASCARA : valor), [modoPrivado])

  return <ModoPrivadoContext.Provider value={{ modoPrivado, toggleModoPrivado, ocultar }}>{children}</ModoPrivadoContext.Provider>
}
