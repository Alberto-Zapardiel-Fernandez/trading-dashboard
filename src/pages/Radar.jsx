// src/pages/Radar.jsx
import { useState, useRef } from 'react'
import { useRadarContext } from '../hooks/useRadarContext.js'
import { buscarTickers } from '../services/yahooFinance'

const ESTADO_CONFIG = {
  SOBREVENTA: { label: '📉 Sobreventa', bg: 'bg-teal-900/40', text: 'text-teal-400', border: 'border-teal-800' },
  SOBRECOMPRA: { label: '📈 Sobrecompra', bg: 'bg-red-900/40', text: 'text-red-400', border: 'border-red-800' },
  CRUCE_DORADO: { label: '✨ Cruce dorado', bg: 'bg-yellow-900/40', text: 'text-yellow-400', border: 'border-yellow-800' },
  CRUCE_MUERTE: { label: '💀 Cruce muerte', bg: 'bg-purple-900/40', text: 'text-purple-400', border: 'border-purple-800' },
  NEUTRAL: { label: '⚙️ Neutral', bg: 'bg-gray-800/40', text: 'text-gray-500', border: 'border-gray-700' }
}

function EstadoBadge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.NEUTRAL
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
}

function FilaTicker({ ticker, datos, onEliminar, onActualizarStopTarget }) {
  const d = datos[ticker.symbol]
  const [editando, setEditando] = useState(false)
  const [stop, setStop] = useState(ticker.stop ?? '')
  const [target, setTarget] = useState(ticker.target ?? '')

  const guardar = () => {
    onActualizarStopTarget(ticker.id, stop !== '' ? parseFloat(stop) : null, target !== '' ? parseFloat(target) : null)
    setEditando(false)
  }

  const precio = d?.precioActual
  const tocaStop = precio && ticker.stop && precio <= ticker.stop
  const tocaTarget = precio && ticker.target && precio >= ticker.target

  const colorFila = tocaTarget ? 'border-l-2 border-l-green-500' : tocaStop ? 'border-l-2 border-l-red-500' : ''

  return (
    <tr className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/30 transition-colors ${colorFila}`}>
      <td className='p-4'>
        <p className='font-bold text-cyan-400'>{ticker.symbol}</p>
        {ticker.nombre && <p className='text-gray-500 text-xs mt-0.5'>{ticker.nombre}</p>}
      </td>

      <td className='p-4 text-right'>
        {d ? <span className='text-white font-bold'>{d.precioActual.toFixed(2)}</span> : <span className='text-gray-600 text-sm'>—</span>}
      </td>

      <td className='p-4 text-right'>
        {d?.rsi != null ? (
          <span className={`font-medium ${d.rsi < 30 ? 'text-teal-400' : d.rsi > 70 ? 'text-red-400' : 'text-gray-300'}`}>{d.rsi.toFixed(1)}</span>
        ) : (
          <span className='text-gray-600'>—</span>
        )}
      </td>

      <td className='p-4 text-right text-sm'>
        {d?.sma50 != null ? (
          <div className='flex flex-col items-end gap-0.5'>
            <span className='text-yellow-400'>{d.sma50.toFixed(2)}</span>
            <span className='text-blue-400'>{d.sma200?.toFixed(2) ?? '—'}</span>
          </div>
        ) : (
          <span className='text-gray-600'>—</span>
        )}
      </td>

      <td className='p-4 text-right text-sm'>
        {editando ? (
          <div className='flex flex-col gap-1 items-end'>
            <input
              type='number'
              placeholder='Stop'
              value={stop}
              onChange={e => setStop(e.target.value)}
              className='bg-gray-800 border border-red-800 rounded px-2 py-1 text-red-400 w-24 text-right text-xs'
            />
            <input
              type='number'
              placeholder='Target'
              value={target}
              onChange={e => setTarget(e.target.value)}
              className='bg-gray-800 border border-green-800 rounded px-2 py-1 text-green-400 w-24 text-right text-xs'
            />
            <button
              onClick={guardar}
              className='text-xs bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-2 py-1 rounded'
            >
              Guardar
            </button>
          </div>
        ) : (
          <div
            className='flex flex-col items-end gap-0.5 cursor-pointer'
            onClick={() => setEditando(true)}
            title='Haz clic para editar stop y target'
          >
            <span className={ticker.stop ? (tocaStop ? 'text-red-400 font-bold' : 'text-red-400/70') : 'text-gray-700'}>
              SL: {ticker.stop ?? '—'}
            </span>
            <span className={ticker.target ? (tocaTarget ? 'text-green-400 font-bold' : 'text-green-400/70') : 'text-gray-700'}>
              TP: {ticker.target ?? '—'}
            </span>
          </div>
        )}
      </td>

      <td className='p-4 text-center'>{d ? <EstadoBadge estado={d.estado} /> : <span className='text-gray-600 text-sm'>Cargando...</span>}</td>

      <td className='p-4 text-right'>
        <button
          onClick={() => onEliminar(ticker.id)}
          className='text-gray-600 hover:text-red-400 transition-colors text-sm'
          title='Eliminar del radar'
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

export default function Radar() {
  const { tickers, datos, cargando, añadirTicker, eliminarTicker, actualizarStopTarget } = useRadarContext()

  const [input, setInput] = useState('')
  const [sugerencias, setSugerencias] = useState([])
  const [mostrarSug, setMostrarSug] = useState(false)
  const [buscandoSug, setBuscandoSug] = useState(false)
  const [nombreSeleccionado, setNombreSeleccionado] = useState('')
  const debounceRef = useRef(null)

  const buscarSugerencias = async query => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setSugerencias([])
      setMostrarSug(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setBuscandoSug(true)
      const res = await buscarTickers(query)
      setSugerencias(res)
      setMostrarSug(res.length > 0)
      setBuscandoSug(false)
    }, 350)
  }

  const seleccionar = (symbol, nombre) => {
    setInput(symbol)
    setNombreSeleccionado(nombre)
    setMostrarSug(false)
    setSugerencias([])
  }

  const handleAñadir = async () => {
    if (!input.trim()) return
    if (tickers.some(t => t.symbol === input.toUpperCase().trim())) return
    await añadirTicker(input.trim(), nombreSeleccionado)
    setInput('')
    setNombreSeleccionado('')
  }

  return (
    <div className='flex flex-col gap-6 py-4'>
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-white'>Radar de vigilancia</h1>
          <p className='text-gray-500 text-sm mt-1'>Seguimiento técnico automático · Alertas Telegram cuando cambia el estado</p>
        </div>

        <div className='relative'>
          <div className='flex gap-2'>
            <div className='relative'>
              <input
                type='text'
                placeholder='Añadir ticker o empresa…'
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  buscarSugerencias(e.target.value)
                }}
                onKeyDown={e => e.key === 'Enter' && handleAñadir()}
                className='bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 w-72 focus:outline-none focus:border-yellow-600'
              />
              {mostrarSug && (
                <div className='absolute top-full left-0 mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden'>
                  {buscandoSug ? (
                    <p className='text-gray-500 text-sm px-4 py-3'>Buscando...</p>
                  ) : (
                    sugerencias.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => seleccionar(s.symbol, s.nombre)}
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
              onClick={handleAñadir}
              className='bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-4 py-2 rounded-lg transition-colors'
            >
              + Añadir
            </button>
          </div>
        </div>
      </div>

      {cargando ? (
        <p className='text-gray-500 text-sm'>Cargando radar...</p>
      ) : tickers.length === 0 ? (
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
          <p className='text-gray-600 text-lg'>No hay tickers en vigilancia</p>
          <p className='text-gray-700 text-sm mt-1'>Añade un ticker para empezar a vigilarlo</p>
        </div>
      ) : (
        <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-gray-800'>
                <th className='text-left text-gray-400 p-4 font-medium'>Ticker</th>
                <th className='text-right text-gray-400 p-4 font-medium'>Precio</th>
                <th className='text-right text-gray-400 p-4 font-medium'>RSI</th>
                <th className='text-right text-gray-400 p-4 font-medium'>
                  <span className='text-yellow-400'>SMA50</span>
                  <span className='text-gray-600'> / </span>
                  <span className='text-blue-400'>SMA200</span>
                </th>
                <th className='text-right text-gray-400 p-4 font-medium'>SL / TP</th>
                <th className='text-center text-gray-400 p-4 font-medium'>Estado</th>
                <th className='p-4'></th>
              </tr>
            </thead>
            <tbody>
              {tickers.map(ticker => (
                <FilaTicker
                  key={ticker.id}
                  ticker={ticker}
                  datos={datos}
                  onEliminar={eliminarTicker}
                  onActualizarStopTarget={actualizarStopTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tickers.length > 0 && (
        <div className='flex flex-wrap gap-3'>
          {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
            <span
              key={key}
              className={`text-xs px-2 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
            >
              {cfg.label}
            </span>
          ))}
          <span className='text-gray-600 text-xs self-center ml-2'>· Actualización cada 30s</span>
        </div>
      )}
    </div>
  )
}
