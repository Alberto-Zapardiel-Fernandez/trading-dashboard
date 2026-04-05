// src/pages/Explorador.jsx
// ─────────────────────────────────────────────────────────────────────────────
// CAMBIOS Sprint 20:
//   · Botón "Ver gráfica" en la ficha del activo — navega a /grafica
//     pasando { ticker, nombre } en location.state para que cargue solo
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarTickers } from '../services/yahooFinance'
import { obtenerNoticias, formatearFecha } from '../services/noticias'
import { useRadarContext } from '../hooks/useRadarContext'

// ── Formato de volumen / capitalización ───────────────────────────────────────
function formatearVolumen(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toString()
}

// ── Ficha del activo ──────────────────────────────────────────────────────────
function FichaActivo({ ficha, onAñadirRadar, yaEnRadar, onVerGrafica }) {
  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4'>
      {/* Cabecera: nombre + botones */}
      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div>
          <div className='flex items-center gap-3'>
            <h2 className='text-2xl font-bold text-white'>{ficha.symbol}</h2>
            <span className='text-gray-500 text-sm'>{ficha.exchange}</span>
          </div>
          <p className='text-gray-400 mt-0.5'>{ficha.nombre}</p>
        </div>

        {/* Botones de acción — alineados a la derecha */}
        <div className='flex items-center gap-2 flex-wrap'>
          {/* ── NUEVO: Ver gráfica ── */}
          <button
            onClick={onVerGrafica}
            className='px-4 py-2 rounded-lg text-sm font-bold transition-colors
                       bg-yellow-600 hover:bg-yellow-500 text-black'
          >
            Ver gráfica →
          </button>

          {/* Añadir al radar */}
          <button
            onClick={onAñadirRadar}
            disabled={yaEnRadar}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              yaEnRadar ? 'bg-gray-800 text-gray-600 cursor-default' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
          >
            {yaEnRadar ? '✓ En radar' : '+ Añadir al radar'}
          </button>
        </div>
      </div>

      {/* Precio */}
      <div className='flex items-baseline gap-3'>
        <span className='text-4xl font-bold text-white'>{ficha.precio?.toFixed(2) ?? '—'}</span>
        <span className='text-gray-500 text-sm'>{ficha.moneda}</span>
      </div>

      {/* Métricas */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        {[
          { label: 'Apertura', valor: ficha.apertura?.toFixed(2) ?? '—' },
          { label: 'Máx. del día', valor: ficha.maxDia?.toFixed(2) ?? '—' },
          { label: 'Mín. del día', valor: ficha.minDia?.toFixed(2) ?? '—' },
          { label: 'Volumen', valor: ficha.volumen ? formatearVolumen(ficha.volumen) : '—' },
          { label: 'Máx. 52 sem.', valor: ficha.max52sem?.toFixed(2) ?? '—' },
          { label: 'Mín. 52 sem.', valor: ficha.min52sem?.toFixed(2) ?? '—' },
          { label: 'Cap. mercado', valor: ficha.capMercado ? formatearVolumen(ficha.capMercado) : '—' },
          { label: 'P/E ratio', valor: ficha.per?.toFixed(2) ?? '—' }
        ].map(m => (
          <div
            key={m.label}
            className='bg-gray-800/50 rounded-lg p-3'
          >
            <p className='text-gray-500 text-xs'>{m.label}</p>
            <p className='text-gray-200 font-semibold mt-0.5'>{m.valor}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Lista de noticias ─────────────────────────────────────────────────────────
function ListaNoticias({ noticias, cargando }) {
  if (cargando) return <p className='text-gray-500 text-sm'>Cargando noticias...</p>
  if (noticias.length === 0) return <p className='text-gray-600 text-sm'>No se encontraron noticias para este ticker.</p>

  return (
    <div className='flex flex-col gap-3'>
      {noticias.map((noticia, i) => (
        <a
          key={i}
          href={noticia.enlace}
          target='_blank'
          rel='noopener noreferrer'
          className='bg-gray-900 border border-gray-800 rounded-xl p-4
                     hover:border-gray-700 hover:bg-gray-800/50 transition-all group'
        >
          <div className='flex items-start justify-between gap-3'>
            <p className='text-gray-200 group-hover:text-white transition-colors leading-snug flex-1'>
              {noticia.titulo}
              {noticia.traducida && <span className='ml-2 text-xs text-gray-600 font-normal'>(traducido)</span>}
            </p>
            <span className='text-gray-600 text-xs shrink-0 mt-0.5'>↗</span>
          </div>
          <div className='flex items-center gap-2 mt-2'>
            <span className='text-gray-600 text-xs'>{noticia.fuente}</span>
            {noticia.fecha && <span className='text-gray-600 text-xs'>· {formatearFecha(noticia.fecha)}</span>}
          </div>
        </a>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Explorador() {
  const navigate = useNavigate()
  const { tickers, añadirTicker } = useRadarContext()

  const [input, setInput] = useState('')
  const [sugerencias, setSugerencias] = useState([])
  const [mostrarSug, setMostrarSug] = useState(false)
  const [buscandoSug, setBuscandoSug] = useState(false)
  const [ficha, setFicha] = useState(null)
  const [noticias, setNoticias] = useState([])
  const [cargandoFicha, setCargandoFicha] = useState(false)
  const [cargandoNoticias, setCargandoNoticias] = useState(false)
  const [error, setError] = useState(null)

  const debounceRef = useRef(null)
  const refBuscador = useRef(null)

  const buscarSugerencias = query => {
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

  const cargarFicha = async (symbol, nombre = '', exchange = '') => {
    setCargandoFicha(true)
    setCargandoNoticias(true)
    setError(null)
    setFicha(null)
    setNoticias([])
    setMostrarSug(false)

    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`
      const res = await fetch(proxyUrl)
      const datos = await res.json()
      const meta = datos?.chart?.result?.[0]?.meta

      if (!meta) {
        setError(`No se encontraron datos para "${symbol}".`)
        setCargandoFicha(false)
        setCargandoNoticias(false)
        return
      }

      const fichaObj = {
        symbol,
        nombre: nombre || meta.longName || meta.shortName || symbol,
        exchange: exchange || meta.exchangeName || '',
        moneda: meta.currency || '',
        precio: meta.regularMarketPrice,
        apertura: meta.regularMarketOpen,
        maxDia: meta.regularMarketDayHigh,
        minDia: meta.regularMarketDayLow,
        volumen: meta.regularMarketVolume,
        max52sem: meta.fiftyTwoWeekHigh,
        min52sem: meta.fiftyTwoWeekLow,
        capMercado: meta.marketCap,
        per: null
      }
      setFicha(fichaObj)

      // Noticias en paralelo
      try {
        const news = await obtenerNoticias(symbol, fichaObj.nombre)
        setNoticias(news)
      } catch {
        setNoticias([])
      } finally {
        setCargandoNoticias(false)
      }
    } catch {
      setError('Error al obtener datos. Inténtalo de nuevo.')
    } finally {
      setCargandoFicha(false)
    }
  }

  const seleccionar = (symbol, nombre, exchange) => {
    setInput(symbol)
    setSugerencias([])
    setMostrarSug(false)
    cargarFicha(symbol, nombre, exchange)
  }

  const handleBuscar = () => {
    if (!input.trim()) return
    cargarFicha(input.toUpperCase().trim())
  }

  const yaEnRadar = ficha && tickers.some(t => t.symbol === ficha.symbol)

  const handleAñadirRadar = async () => {
    if (!ficha || yaEnRadar) return
    await añadirTicker(ficha.symbol, ficha.nombre)
  }

  // ── NUEVO: navegar a /grafica pasando el ticker en location.state ──────────
  const handleVerGrafica = () => {
    if (!ficha) return
    navigate('/grafica', { state: { ticker: ficha.symbol, nombre: ficha.nombre } })
  }

  return (
    <div className='flex flex-col gap-6 py-4'>
      <div>
        <h1 className='text-2xl font-bold text-white'>Explorador de mercado</h1>
        <p className='text-gray-500 text-sm mt-1'>Busca cualquier acción, ETF o índice y consulta su ficha completa y noticias</p>
      </div>

      {/* Buscador */}
      <div
        ref={refBuscador}
        className='relative max-w-lg'
      >
        <div className='flex gap-2'>
          <input
            type='text'
            placeholder='Ticker o empresa (ej: Santander, Apple, VUAA)'
            value={input}
            onChange={e => {
              setInput(e.target.value)
              buscarSugerencias(e.target.value)
            }}
            onKeyDown={e => e.key === 'Enter' && handleBuscar()}
            className='bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white
                       placeholder-gray-500 flex-1 focus:outline-none focus:border-yellow-600'
          />
          <button
            onClick={handleBuscar}
            className='bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-5 py-2.5 rounded-lg transition-colors'
          >
            Buscar
          </button>
        </div>

        {mostrarSug && (
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
                  onClick={() => seleccionar(s.symbol, s.nombre, s.exchange)}
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

      {error && <p className='text-red-400 text-sm'>{error}</p>}

      {cargandoFicha && (
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-8 text-center'>
          <p className='text-gray-400'>Cargando datos del activo...</p>
        </div>
      )}

      {ficha && !cargandoFicha && (
        <FichaActivo
          ficha={ficha}
          onAñadirRadar={handleAñadirRadar}
          yaEnRadar={yaEnRadar}
          onVerGrafica={handleVerGrafica}
        />
      )}

      {(ficha || cargandoNoticias) && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>
            Noticias recientes
            {ficha && <span className='text-gray-500 font-normal text-sm ml-2'>· {ficha.symbol}</span>}
          </h2>
          <ListaNoticias
            noticias={noticias}
            cargando={cargandoNoticias}
          />
        </div>
      )}

      {!ficha && !cargandoFicha && !error && (
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
          <p className='text-gray-600 text-lg'>Busca un activo para ver su ficha</p>
          <p className='text-gray-700 text-sm mt-1'>Ejemplos: SAN.MC · AAPL · VUAA.DE · ^GSPC · BTC-USD</p>
        </div>
      )}
    </div>
  )
}
