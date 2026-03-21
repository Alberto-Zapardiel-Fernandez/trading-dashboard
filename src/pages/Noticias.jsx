// src/pages/Noticias.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Página de noticias macro: mercados, economía global, geopolítica.
// Agrega noticias de Expansión, El Economista, Investing.com y Reuters.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { obtenerNoticiasMacro, formatearFecha, FUENTES_MACRO } from '../services/noticias'

// Colores por fuente
const FUENTE_COLORES = {
  expansion: 'text-blue-400   border-blue-800   bg-blue-900/20',
  eleconomista: 'text-green-400  border-green-800  bg-green-900/20',
  investing: 'text-orange-400 border-orange-800 bg-orange-900/20',
  elPais: 'text-red-400 border-red-800 bg-red-900/20'
}

function BadgeFuente({ fuenteId, nombre }) {
  const clases = FUENTE_COLORES[fuenteId] ?? 'text-gray-400 border-gray-700 bg-gray-800/20'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${clases}`}>{nombre}</span>
}

function TarjetaNoticia({ noticia }) {
  return (
    <a
      href={noticia.enlace}
      target='_blank'
      rel='noopener noreferrer'
      className='bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 hover:bg-gray-800/50 transition-all group flex flex-col gap-2'
    >
      <p className='text-gray-200 group-hover:text-white transition-colors leading-snug'>
        {noticia.titulo}
        {noticia.traducida && <span className='ml-2 text-xs text-gray-600'>(trad.)</span>}
      </p>
      <div className='flex items-center gap-2 mt-auto'>
        <BadgeFuente
          fuenteId={noticia.fuenteId}
          nombre={noticia.fuente}
        />
        {noticia.fecha && <span className='text-gray-600 text-xs'>{formatearFecha(noticia.fecha)}</span>}
        <span className='text-gray-700 text-xs ml-auto'>↗</span>
      </div>
    </a>
  )
}

export default function Noticias() {
  const [noticias, setNoticias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [fuenteActiva, setFuenteActiva] = useState('todas')
  const [ultimaActualizacion, setUltima] = useState(null)

  const cargar = async (fuenteId = 'todas') => {
    setCargando(true)
    const ids = fuenteId === 'todas' ? [] : [fuenteId]
    const resultado = await obtenerNoticiasMacro(ids)
    setNoticias(resultado)
    setUltima(new Date())
    setCargando(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
  }, [])

  const handleFuente = id => {
    setFuenteActiva(id)
    cargar(id)
  }

  const noticiasFiltradas = fuenteActiva === 'todas' ? noticias : noticias.filter(n => n.fuenteId === fuenteActiva)

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div className='flex items-start justify-between flex-wrap gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-white'>Noticias de mercado</h1>
          <p className='text-gray-500 text-sm mt-1'>
            Macroeconomía, mercados globales y geopolítica
            {ultimaActualizacion && (
              <span className='ml-2 text-gray-700'>
                · Actualizado a las {ultimaActualizacion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => cargar(fuenteActiva)}
          className='bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors'
        >
          ↻ Actualizar
        </button>
      </div>

      {/* ── Filtro por fuente ── */}
      <div className='flex gap-2 flex-wrap'>
        <button
          onClick={() => handleFuente('todas')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            fuenteActiva === 'todas' ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Todas
        </button>
        {FUENTES_MACRO.map(f => (
          <button
            key={f.id}
            onClick={() => handleFuente(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              fuenteActiva === f.id ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      {cargando ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className='bg-gray-900 border border-gray-800 rounded-xl p-4 h-28 animate-pulse'
            />
          ))}
        </div>
      ) : noticiasFiltradas.length === 0 ? (
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
          <p className='text-gray-600'>No se pudieron cargar las noticias.</p>
          <p className='text-gray-700 text-sm mt-1'>Puede ser un problema temporal con las fuentes RSS.</p>
          <button
            onClick={() => cargar(fuenteActiva)}
            className='mt-4 bg-yellow-600 hover:bg-yellow-500 text-black font-bold px-4 py-2 rounded-lg text-sm'
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {noticiasFiltradas.map((n, i) => (
            <TarjetaNoticia
              key={i}
              noticia={n}
            />
          ))}
        </div>
      )}
    </div>
  )
}
