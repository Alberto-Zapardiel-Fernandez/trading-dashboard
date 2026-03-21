// ============================================================
// ModoPrivadoContext.jsx — solo el contexto y el hook
// El Provider está en ModoPrivadoProvider.jsx (igual que Radar)
// ============================================================

import { createContext, useContext } from 'react'

// Símbolo que reemplaza valores sensibles en modo privado
export const MASCARA = '••••'

// El contexto en sí — se exporta para que el Provider lo use
export const ModoPrivadoContext = createContext(null)

// Hook para consumir el contexto desde cualquier página/componente
export function useModoPrivado() {
  const ctx = useContext(ModoPrivadoContext)
  if (!ctx) throw new Error('useModoPrivado debe usarse dentro de ModoPrivadoProvider')
  return ctx
}
