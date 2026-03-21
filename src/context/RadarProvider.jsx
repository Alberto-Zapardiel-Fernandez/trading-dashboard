import { RadarContext } from './RadarContext'
import { useRadar } from '../hooks/useRadar'

export function RadarProvider({ children }) {
  const radar = useRadar()
  return <RadarContext.Provider value={radar}>{children}</RadarContext.Provider>
}
