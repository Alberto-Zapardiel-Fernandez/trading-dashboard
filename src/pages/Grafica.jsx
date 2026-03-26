// src/pages/Grafica.jsx
// ─────────────────────────────────────────────────────────────────────────────
// CAMBIOS Sprint 20:
//   · Lee el ticker desde React Router location.state cuando viene del Explorador
//     y carga la gráfica automáticamente sin que el usuario tenga que buscar
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { obtenerVelas, buscarTickers } from '../services/yahooFinance'
import GraficaVelas from '../components/GraficaVelas'

const TEMPORALIDADES = [
  { key: '1m', label: '1m' },
  { key: '15m', label: '15m' },
  { key: '1h', label: '1h' },
  { key: '4h', label: '4h' },
  { key: '1D', label: '1D' },
  { key: '1S', label: '1S' },
  { key: '1M', label: '1M' }
]

export default function Grafica() {
  const location = useLocation()

  const [inputTicker, setInputTicker] = useState('')
  const [tickerActivo, setTickerActivo] = useState('')
  const [nombreActivo, setNombreActivo] = useState('')
  const [temporalidad, setTemporalidad] = useState('1D')
  const [velas, setVelas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [sugerencias, setSugerencias] = useState([])
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [buscandoSug, setBuscandoSug] = useState(false)

  const refBuscador = useRef(null)
  const debounceRef = useRef(null)

  // ── Cargar gráfica ─────────────────────────────────────────────────────────
  const cargarGrafica = useCallback(async (ticker, nombre, temp) => {
    if (!ticker) return
    const t = ticker.toUpperCase().trim()
    setCargando(true)
    setError(null)
    setVelas([])
    const datos = await obtenerVelas(t, temp)
    if (!datos || datos.length === 0) {
      setError(`No se encontraron datos para "${t}". Comprueba el ticker.`)
    } else {
      setVelas(datos)
      setTickerActivo(t)
      setNombreActivo(nombre || t)
      setInputTicker(t)
    }
    setCargando(false)
  }, [])

  // ── Si venimos del Explorador, location.state trae { ticker, nombre } ──────
  // Se ejecuta una sola vez al montar el componente
  useEffect(() => {
    const { ticker, nombre } = location.state || {}
    if (ticker) cargarGrafica(ticker, nombre || ticker, '1D')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cierra sugerencias al hacer clic fuera
  useEffect(() => {
    const handler = e => {
      if (refBuscador.current && !refBuscador.current.contains(e.target)) setMostrarSugerencias(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const buscarSugerencias = useCallback(query => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setSugerencias([])
      setMostrarSugerencias(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setBuscandoSug(true)
      const resultados = await buscarTickers(query)
      setSugerencias(resultados)
      setMostrarSugerencias(resultados.length > 0)
      setBuscandoSug(false)
    }, 350)
  }, [])

  const handleInputChange = e => {
    setInputTicker(e.target.value)
    buscarSugerencias(e.target.value)
  }

  const seleccionarSugerencia = (symbol, nombre) => {
    setInputTicker(symbol)
    setMostrarSugerencias(false)
    setSugerencias([])
    cargarGrafica(symbol, nombre, temporalidad)
  }

  const handleBuscar = () => {
    setMostrarSugerencias(false)
    cargarGrafica(inputTicker, '', temporalidad)
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter') handleBuscar()
    if (e.key === 'Escape') setMostrarSugerencias(false)
  }

  const handleTemporalidad = temp => {
    setTemporalidad(temp)
    if (tickerActivo) cargarGrafica(tickerActivo, nombreActivo, temp)
  }

  return (
    <div className='flex flex-col gap-5 py-4'>
      <div>
        <h1 className='text-2xl font-bold text-white'>Análisis técnico</h1>
        <p className='text-gray-500 text-sm mt-1'>Busca cualquier ticker para ver su gráfica con indicadores</p>
      </div>

      <div className='flex flex-col sm:flex-row sm:items-center gap-3'>
        {/* Buscador */}
        <div
          ref={refBuscador}
          className='relative w-full sm:w-auto'
        >
          <input
            type='text'
            placeholder='Ticker o empresa (ej: Santander, Apple…)'
            value={inputTicker}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => sugerencias.length > 0 && setMostrarSugerencias(true)}
            className='bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white
                       placeholder-gray-500 w-full sm:w-80 focus:outline-none focus:border-yellow-600'
          />
          {mostrarSugerencias && (
            <div
              className='absolute top-full left-0 mt-1 w-full bg-gray-900 border border-gray-700
                            rounded-xl shadow-2xl z-50 overflow-hidden'
            >
              {buscandoSug ? (
                <p className='text-gray-500 text-sm px-4 py-3'>Buscando...</p>
              ) : (
                sugerencias.map(s => (
                  <button
                    key={s.symbol}
                    onClick={() => seleccionarSugerencia(s.symbol, s.nombre)}
                    className='w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors flex items-center gap-3'
                  >
                    <span className='text-cyan-400 font-bold text-sm w-24 shrink-0'>{s.symbol}</span>
                    <span className='text-gray-300 text-sm truncate flex-1'>{s.nombre}</span>
                    <span className='text-gray-600 text-xs shrink-0'>{s.exchange}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleBuscar}
          className='bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-5 py-2
                     rounded-lg transition-colors w-full sm:w-auto'
        >
          Buscar
        </button>

        {/* Temporalidades */}
        <div className='overflow-x-auto pb-1'>
          <div className='flex gap-1 min-w-max'>
            {TEMPORALIDADES.map(t => (
              <button
                key={t.key}
                onClick={() => handleTemporalidad(t.key)}
                className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                  temporalidad === t.key ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tickerActivo && (
        <div className='flex items-baseline gap-3 flex-wrap'>
          <h1 className='text-2xl font-bold text-white'>{tickerActivo}</h1>
          {nombreActivo && nombreActivo !== tickerActivo && <span className='text-gray-400 text-xl'>{nombreActivo}</span>}
          <span className='text-gray-600 text-xl'>· {TEMPORALIDADES.find(t => t.key === temporalidad)?.label}</span>
        </div>
      )}

      <GraficaVelas
        velas={velas}
        cargando={cargando}
        error={error}
        temporalidad={temporalidad}
      />
    </div>
  )
}
