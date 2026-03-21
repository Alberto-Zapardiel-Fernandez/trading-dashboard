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
  return (
    <span
      className={`text-xs font-semibold px-2 py-1 rounded-full border
                      ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  )
}

// ── Fila escritorio ───────────────────────────────────────────────────────────
function FilaTicker({ ticker, datos, onEliminar, onActualizarStopTarget, onActualizarAlertas, onActualizarNota }) {
  const d = datos[ticker.symbol]
  const [editandoSLTP, setEditandoSLTP] = useState(false)
  const [editandoAlertas, setEditandoAlertas] = useState(false)
  // ── NUEVO: estado local para editar la nota ──
  const [editandoNota, setEditandoNota] = useState(false)
  const [nota, setNota] = useState(ticker.nota ?? '')

  const [stop, setStop] = useState(ticker.stop ?? '')
  const [target, setTarget] = useState(ticker.target ?? '')
  const [sobre, setSobre] = useState(ticker.alertaSobre ?? '')
  const [bajo, setBajo] = useState(ticker.alertaBajo ?? '')

  const guardarSLTP = () => {
    onActualizarStopTarget(ticker.id, stop !== '' ? parseFloat(stop) : null, target !== '' ? parseFloat(target) : null)
    setEditandoSLTP(false)
  }

  const guardarAlertas = () => {
    onActualizarAlertas(ticker.id, sobre, bajo)
    setEditandoAlertas(false)
  }

  // ── NUEVO: guarda la nota en Firestore ──
  const guardarNota = () => {
    onActualizarNota(ticker.id, nota)
    setEditandoNota(false)
  }

  const precio = d?.precioActual
  const tocaStop = precio && ticker.stop && precio <= ticker.stop
  const tocaTarget = precio && ticker.target && precio >= ticker.target
  const colorFila = tocaTarget ? 'border-l-2 border-l-green-500' : tocaStop ? 'border-l-2 border-l-red-500' : ''

  return (
    <tr
      className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/30
                    transition-colors ${colorFila}`}
    >
      {/* Ticker + nombre + nota */}
      <td className='p-4'>
        <p className='font-bold text-cyan-400'>{ticker.symbol}</p>
        {ticker.nombre && <p className='text-gray-500 text-xs mt-0.5'>{ticker.nombre}</p>}
        {/* ── NUEVO: nota visible + editable ── */}
        {editandoNota ? (
          <div className='flex items-center gap-2 mt-1'>
            <input
              type='text'
              value={nota}
              onChange={e => setNota(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') guardarNota()
                if (e.key === 'Escape') setEditandoNota(false)
              }}
              placeholder='Añadir nota...'
              autoFocus
              className='bg-gray-800 border border-gray-600 rounded px-2 py-1
                         text-gray-300 text-xs w-48 outline-none focus:border-yellow-600'
            />
            <button
              onClick={guardarNota}
              className='text-xs text-yellow-500 hover:text-yellow-400'
            >
              ✓
            </button>
            <button
              onClick={() => setEditandoNota(false)}
              className='text-xs text-gray-600 hover:text-gray-400'
            >
              ✕
            </button>
          </div>
        ) : (
          <p
            onClick={() => setEditandoNota(true)}
            className='text-gray-600 text-xs mt-1 cursor-pointer hover:text-gray-400
                       transition-colors italic'
            title='Clic para editar nota'
          >
            {ticker.nota ? `📝 ${ticker.nota}` : '+ nota'}
          </p>
        )}
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
          <span>
            <span className='text-yellow-400'>{d.sma50.toFixed(2)}</span>
            <span className='text-gray-600'> / </span>
            <span className='text-blue-400'>{d.sma200?.toFixed(2) ?? '—'}</span>
          </span>
        ) : (
          <span className='text-gray-600'>—</span>
        )}
      </td>

      {/* SL / TP */}
      <td className='p-4 text-right text-sm'>
        {editandoSLTP ? (
          <div className='flex flex-col gap-1 items-end'>
            <input
              type='number'
              placeholder='Stop'
              value={stop}
              onChange={e => setStop(e.target.value)}
              className='bg-gray-800 border border-red-800 rounded px-2 py-1
                         text-red-400 w-24 text-right text-xs'
            />
            <input
              type='number'
              placeholder='Target'
              value={target}
              onChange={e => setTarget(e.target.value)}
              className='bg-gray-800 border border-green-800 rounded px-2 py-1
                         text-green-400 w-24 text-right text-xs'
            />
            <button
              onClick={guardarSLTP}
              className='text-xs bg-yellow-600 hover:bg-yellow-500 text-black
                         font-bold px-2 py-1 rounded'
            >
              Guardar
            </button>
          </div>
        ) : (
          <div
            className='flex flex-col items-end gap-0.5 cursor-pointer'
            onClick={() => setEditandoSLTP(true)}
            title='Clic para editar SL/TP'
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

      {/* Alertas precio */}
      <td className='p-4 text-right text-sm'>
        {editandoAlertas ? (
          <div className='flex flex-col gap-1 items-end'>
            <input
              type='number'
              placeholder='Precio ≥'
              value={sobre}
              onChange={e => setSobre(e.target.value)}
              className='bg-gray-800 border border-orange-700 rounded px-2 py-1
                         text-orange-400 w-24 text-right text-xs'
            />
            <input
              type='number'
              placeholder='Precio ≤'
              value={bajo}
              onChange={e => setBajo(e.target.value)}
              className='bg-gray-800 border border-blue-700 rounded px-2 py-1
                         text-blue-400 w-24 text-right text-xs'
            />
            <button
              onClick={guardarAlertas}
              className='text-xs bg-yellow-600 hover:bg-yellow-500 text-black
                         font-bold px-2 py-1 rounded'
            >
              Guardar
            </button>
          </div>
        ) : (
          <div
            className='flex flex-col items-end gap-0.5 cursor-pointer'
            onClick={() => setEditandoAlertas(true)}
            title='Clic para configurar alertas'
          >
            <span className={ticker.alertaSobre != null ? 'text-orange-400/80' : 'text-gray-700'}>≥ {ticker.alertaSobre ?? '—'}</span>
            <span className={ticker.alertaBajo != null ? 'text-blue-400/80' : 'text-gray-700'}>≤ {ticker.alertaBajo ?? '—'}</span>
          </div>
        )}
      </td>

      <td className='p-4 text-center'>{d ? <EstadoBadge estado={d.estado} /> : <span className='text-gray-600 text-sm'>Cargando...</span>}</td>

      <td className='p-4 text-right'>
        <button
          onClick={() => onEliminar(ticker.id)}
          className='text-gray-600 hover:text-red-400 transition-colors text-sm'
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

// ── Tarjeta móvil ─────────────────────────────────────────────────────────────
function TarjetaTicker({ ticker, datos, onEliminar, onActualizarStopTarget, onActualizarAlertas, onActualizarNota }) {
  const d = datos[ticker.symbol]
  const [editandoSLTP, setEditandoSLTP] = useState(false)
  const [editandoAlertas, setEditandoAlertas] = useState(false)
  // ── NUEVO ──
  const [editandoNota, setEditandoNota] = useState(false)
  const [nota, setNota] = useState(ticker.nota ?? '')

  const [stop, setStop] = useState(ticker.stop ?? '')
  const [target, setTarget] = useState(ticker.target ?? '')
  const [sobre, setSobre] = useState(ticker.alertaSobre ?? '')
  const [bajo, setBajo] = useState(ticker.alertaBajo ?? '')

  const guardarSLTP = () => {
    onActualizarStopTarget(ticker.id, stop !== '' ? parseFloat(stop) : null, target !== '' ? parseFloat(target) : null)
    setEditandoSLTP(false)
  }

  const guardarAlertas = () => {
    onActualizarAlertas(ticker.id, sobre, bajo)
    setEditandoAlertas(false)
  }

  // ── NUEVO ──
  const guardarNota = () => {
    onActualizarNota(ticker.id, nota)
    setEditandoNota(false)
  }

  const precio = d?.precioActual
  const tocaStop = precio && ticker.stop && precio <= ticker.stop
  const tocaTarget = precio && ticker.target && precio >= ticker.target
  const bordeColor = tocaTarget ? 'border-l-4 border-l-green-500' : tocaStop ? 'border-l-4 border-l-red-500' : ''

  return (
    <div
      className={`bg-gray-900 border border-gray-800 rounded-xl p-4
                     flex flex-col gap-3 ${bordeColor}`}
    >
      {/* Fila 1: ticker + precio + eliminar */}
      <div className='flex items-start justify-between'>
        <div>
          <span className='font-bold text-cyan-400 text-base'>{ticker.symbol}</span>
          {ticker.nombre && <p className='text-gray-500 text-xs mt-0.5'>{ticker.nombre}</p>}
          {/* ── NUEVO: nota visible + editable ── */}
          {editandoNota ? (
            <div className='flex items-center gap-2 mt-1'>
              <input
                type='text'
                value={nota}
                onChange={e => setNota(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') guardarNota()
                  if (e.key === 'Escape') setEditandoNota(false)
                }}
                placeholder='Añadir nota...'
                autoFocus
                className='bg-gray-800 border border-gray-600 rounded px-2 py-1
                           text-gray-300 text-xs w-44 outline-none focus:border-yellow-600'
              />
              <button
                onClick={guardarNota}
                className='text-xs text-yellow-500 hover:text-yellow-400'
              >
                ✓
              </button>
              <button
                onClick={() => setEditandoNota(false)}
                className='text-xs text-gray-600 hover:text-gray-400'
              >
                ✕
              </button>
            </div>
          ) : (
            <p
              onClick={() => setEditandoNota(true)}
              className='text-gray-600 text-xs mt-1 cursor-pointer hover:text-gray-400
                         transition-colors italic'
            >
              {ticker.nota ? `📝 ${ticker.nota}` : '+ nota'}
            </p>
          )}
        </div>
        <div className='flex items-center gap-3'>
          {d && <span className='text-white font-bold text-lg'>{d.precioActual.toFixed(2)}</span>}
          <button
            onClick={() => onEliminar(ticker.id)}
            className='text-gray-600 hover:text-red-400 transition-colors'
          >
            ✕
          </button>
        </div>
      </div>

      {/* Fila 2: indicadores + estado */}
      <div className='flex items-center gap-3 flex-wrap'>
        {d?.rsi != null && (
          <span className={`text-sm font-medium ${d.rsi < 30 ? 'text-teal-400' : d.rsi > 70 ? 'text-red-400' : 'text-gray-300'}`}>
            RSI {d.rsi.toFixed(1)}
          </span>
        )}
        {d?.sma50 != null && <span className='text-xs text-yellow-400'>SMA50 {d.sma50.toFixed(2)}</span>}
        {d?.sma200 != null && <span className='text-xs text-blue-400'>SMA200 {d.sma200.toFixed(2)}</span>}
        {d && <EstadoBadge estado={d.estado} />}
        {!d && <span className='text-gray-600 text-xs'>Cargando...</span>}
      </div>

      {/* Fila 3: SL / TP */}
      {editandoSLTP ? (
        <div className='flex gap-2 flex-wrap items-end'>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-500 text-xs'>Stop Loss</label>
            <input
              type='number'
              placeholder='—'
              value={stop}
              onChange={e => setStop(e.target.value)}
              className='bg-gray-800 border border-red-800 rounded px-2 py-1
                         text-red-400 w-28 text-sm'
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-500 text-xs'>Take Profit</label>
            <input
              type='number'
              placeholder='—'
              value={target}
              onChange={e => setTarget(e.target.value)}
              className='bg-gray-800 border border-green-800 rounded px-2 py-1
                         text-green-400 w-28 text-sm'
            />
          </div>
          <button
            onClick={guardarSLTP}
            className='bg-yellow-600 hover:bg-yellow-500 text-black
                       font-bold px-3 py-1.5 rounded text-sm'
          >
            Guardar
          </button>
        </div>
      ) : (
        <div
          className='flex gap-4 cursor-pointer'
          onClick={() => setEditandoSLTP(true)}
          title='Toca para editar SL/TP'
        >
          <span className={`text-sm ${ticker.stop ? (tocaStop ? 'text-red-400 font-bold' : 'text-red-400/70') : 'text-gray-700'}`}>
            SL: {ticker.stop ?? '—'}
          </span>
          <span className={`text-sm ${ticker.target ? (tocaTarget ? 'text-green-400 font-bold' : 'text-green-400/70') : 'text-gray-700'}`}>
            TP: {ticker.target ?? '—'}
          </span>
          <span className='text-gray-600 text-xs self-center'>✎</span>
        </div>
      )}

      {/* Fila 4: alertas de precio */}
      {editandoAlertas ? (
        <div className='flex gap-2 flex-wrap items-end'>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-500 text-xs'>Alerta precio ≥</label>
            <input
              type='number'
              placeholder='—'
              value={sobre}
              onChange={e => setSobre(e.target.value)}
              className='bg-gray-800 border border-orange-700 rounded px-2 py-1
                         text-orange-400 w-28 text-sm'
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-500 text-xs'>Alerta precio ≤</label>
            <input
              type='number'
              placeholder='—'
              value={bajo}
              onChange={e => setBajo(e.target.value)}
              className='bg-gray-800 border border-blue-700 rounded px-2 py-1
                         text-blue-400 w-28 text-sm'
            />
          </div>
          <button
            onClick={guardarAlertas}
            className='bg-yellow-600 hover:bg-yellow-500 text-black
                       font-bold px-3 py-1.5 rounded text-sm'
          >
            Guardar
          </button>
        </div>
      ) : (
        <div
          className='flex gap-4 cursor-pointer'
          onClick={() => setEditandoAlertas(true)}
          title='Toca para configurar alertas'
        >
          <span className={`text-sm ${ticker.alertaSobre != null ? 'text-orange-400/80' : 'text-gray-700'}`}>🔔 ≥ {ticker.alertaSobre ?? '—'}</span>
          <span className={`text-sm ${ticker.alertaBajo != null ? 'text-blue-400/80' : 'text-gray-700'}`}>🔔 ≤ {ticker.alertaBajo ?? '—'}</span>
          <span className='text-gray-600 text-xs self-center'>✎</span>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Radar() {
  const {
    tickers,
    datos,
    cargando,
    añadirTicker,
    eliminarTicker,
    actualizarStopTarget,
    actualizarAlertas,
    actualizarNota // ── NUEVO
  } = useRadarContext()

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
      {/* ── Cabecera + buscador ── */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold text-white'>Radar de vigilancia</h1>
          <p className='text-gray-500 text-sm mt-1'>Seguimiento técnico automático · Alertas Telegram cuando cambia el estado</p>
        </div>
        <div className='relative w-full sm:w-auto'>
          <div className='flex gap-2'>
            <div className='relative flex-1 sm:flex-initial'>
              <input
                type='text'
                placeholder='Añadir ticker o empresa…'
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  buscarSugerencias(e.target.value)
                }}
                onKeyDown={e => e.key === 'Enter' && handleAñadir()}
                className='bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white
                           placeholder-gray-500 w-full sm:w-72
                           focus:outline-none focus:border-yellow-600'
              />
              {mostrarSug && (
                <div
                  className='absolute top-full left-0 mt-1 w-full bg-gray-900
                                border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden'
                >
                  {buscandoSug ? (
                    <p className='text-gray-500 text-sm px-4 py-3'>Buscando...</p>
                  ) : (
                    sugerencias.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => seleccionar(s.symbol, s.nombre)}
                        className='w-full text-left px-4 py-2.5 hover:bg-gray-800
                                   transition-colors flex items-center gap-3'
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
              className='bg-yellow-600 hover:bg-yellow-500 text-black font-bold
                         px-4 py-2 rounded-lg transition-colors shrink-0'
            >
              + Añadir
            </button>
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      {cargando ? (
        <p className='text-gray-500 text-sm'>Cargando radar...</p>
      ) : tickers.length === 0 ? (
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
          <p className='text-gray-600 text-lg'>No hay tickers en vigilancia</p>
          <p className='text-gray-700 text-sm mt-1'>Añade un ticker para empezar a vigilarlo</p>
        </div>
      ) : (
        <>
          {/* Móvil */}
          <div className='flex flex-col gap-3 md:hidden'>
            {tickers.map(ticker => (
              <TarjetaTicker
                key={ticker.id}
                ticker={ticker}
                datos={datos}
                onEliminar={eliminarTicker}
                onActualizarStopTarget={actualizarStopTarget}
                onActualizarAlertas={actualizarAlertas}
                onActualizarNota={actualizarNota}
              />
            ))}
          </div>

          {/* Escritorio */}
          <div
            className='hidden md:block bg-gray-900 border border-gray-800
                          rounded-xl overflow-hidden'
          >
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left   text-gray-400 p-4 font-medium'>Ticker</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>Precio</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>RSI</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>
                    <span className='text-yellow-400'>SMA50</span>
                    <span className='text-gray-600'> / </span>
                    <span className='text-blue-400'>SMA200</span>
                  </th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>SL / TP</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>🔔 Alertas precio</th>
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
                    onActualizarAlertas={actualizarAlertas}
                    onActualizarNota={actualizarNota}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Leyenda */}
      {tickers.length > 0 && (
        <div className='flex flex-wrap gap-3'>
          {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
            <span
              key={key}
              className={`text-xs px-2 py-1 rounded-full border
                          ${cfg.bg} ${cfg.text} ${cfg.border}`}
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
