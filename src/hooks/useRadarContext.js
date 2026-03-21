import { useContext } from 'react'
import { RadarContext } from '../context/RadarContext'

export function useRadarContext() {
  return useContext(RadarContext)
}
