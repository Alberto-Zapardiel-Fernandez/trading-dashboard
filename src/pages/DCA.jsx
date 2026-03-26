// ─────────────────────────────────────────────────────────────────────────────
// DCA.jsx — Cartera Bunker: seguimiento de inversión a largo plazo
//
// Antes: solo VUSA. Ahora: cualquier ticker (VUSA.DE, SAN.MC, ITX.MC, etc.)
//
// MODELO DE DATOS en Firestore (users/{uid}/dca/{id}):
//   fecha          string   'YYYY-MM-DD'
//   ticker         string   Símbolo Yahoo Finance (ej: 'VUSA.DE')
//   nombre         string   Nombre corto para mostrar (ej: 'VUSA')
//   invertido      number   Importe en euros pagado
//   precioCompra   number   Precio por participación en el momento de compra
//   participaciones number  invertido / precioCompra
//   fechaRegistro  timestamp
//
// RETROCOMPATIBILIDAD:
//   Las aportaciones antiguas sin campo 'ticker' se asumen como 'VUSA.DE'
//   y nombre 'VUSA'. No hay que migrar nada en Firestore.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES } from '../config/constants'
import { usePreciosVivos } from '../hooks/usePreciosVivos'
import { useModoPrivado } from '../context/ModoPrivadoContext'

// ── Tickers predefinidos para sugerencias rápidas ─────────────────────────────
// El usuario puede escribir cualquier otro ticker de Yahoo Finance libremente
const SUGERENCIAS_TICKER = [
  { ticker: 'VUSA.DE', nombre: 'VUSA' },
  { ticker: 'SAN.MC', nombre: 'Santander' },
  { ticker: 'ITX.MC', nombre: 'Inditex' },
  { ticker: 'BBVA.MC', nombre: 'BBVA' },
  { ticker: 'REP.MC', nombre: 'Repsol' },
  { ticker: 'TEF.MC', nombre: 'Telefónica' }
]

// ── Utilidades de formato ─────────────────────────────────────────────────────
const fmt2 = n => (n || 0).toFixed(2)
const fmt3 = n => (n || 0).toFixed(3)
const fmt4 = n => (n || 0).toFixed(4)

// ── Componente: Tarjeta resumen de un ticker ──────────────────────────────────
function TarjetaTicker({ grupo, precioActual, ocultar, onEliminarAportacion, tickerActivo, setTickerActivo }) {
  const { ticker, nombre, aportaciones } = grupo

  const totalInvertido = aportaciones.reduce((s, a) => s + (a.invertido || 0), 0)
  const totalParticipaciones = aportaciones.reduce((s, a) => s + (a.participaciones || 0), 0)
  const precioMedio = totalParticipaciones > 0 ? totalInvertido / totalParticipaciones : 0
  const precio = parseFloat(precioActual) || 0
  const valorActual = totalParticipaciones * precio
  const pnl = valorActual - totalInvertido
  const pnlPct = totalInvertido > 0 ? (pnl / totalInvertido) * 100 : 0
  const estaAbierto = tickerActivo === ticker

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${estaAbierto ? 'border-amber-700' : 'border-gray-800'}`}>
      {/* ── Cabecera de la tarjeta (siempre visible) ── */}
      <button
        onClick={() => setTickerActivo(estaAbierto ? null : ticker)}
        className='w-full p-4 flex items-center justify-between gap-4 hover:bg-gray-800/50 transition-colors'
      >
        <div className='flex items-center gap-3'>
          <div className='text-left'>
            <p className='font-bold text-amber-400 text-base'>{nombre || ticker}</p>
            <p className='text-gray-600 text-xs'>{ticker}</p>
          </div>
        </div>

        <div className='flex items-center gap-6'>
          {/* Precio actual */}
          {precio > 0 && (
            <div className='text-right hidden sm:block'>
              <p className='text-gray-400 text-xs'>Precio</p>
              <p className='text-yellow-400 font-bold'>{fmt3(precio)} €</p>
            </div>
          )}
          {/* Valor actual */}
          <div className='text-right hidden sm:block'>
            <p className='text-gray-400 text-xs'>Valor</p>
            <p className='text-white font-bold'>{ocultar(`${fmt2(valorActual)} €`)}</p>
          </div>
          {/* P&L */}
          <div className='text-right'>
            <p className='text-gray-400 text-xs'>P&L</p>
            <p className={`font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ocultar(`${pnl >= 0 ? '+' : ''}${fmt2(pnl)} €`)}</p>
            <p className={`text-xs ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{ocultar(`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`)}</p>
          </div>
          {/* Chevron */}
          <span className={`text-gray-600 transition-transform ${estaAbierto ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {/* ── Métricas secundarias (siempre visibles en móvil) ── */}
      <div className='px-4 pb-3 flex gap-4 text-sm sm:hidden'>
        <span className='text-gray-500'>
          Invertido <span className='text-blue-300'>{ocultar(`${fmt2(totalInvertido)} €`)}</span>
        </span>
        <span className='text-gray-500'>
          PM <span className='text-purple-400'>{fmt3(precioMedio)} €</span>
        </span>
      </div>

      {/* ── Detalle expandible: métricas + tabla de aportaciones ── */}
      {estaAbierto && (
        <div className='border-t border-gray-800'>
          {/* Métricas del grupo */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 p-4'>
            <div className='bg-gray-800/50 rounded-lg p-3'>
              <p className='text-gray-500 text-xs mb-1'>Total invertido</p>
              <p className='text-blue-300 font-bold'>{ocultar(`${fmt2(totalInvertido)} €`)}</p>
            </div>
            <div className='bg-gray-800/50 rounded-lg p-3'>
              <p className='text-gray-500 text-xs mb-1'>Participaciones</p>
              <p className='text-cyan-400 font-bold'>{fmt4(totalParticipaciones)}</p>
            </div>
            <div className='bg-gray-800/50 rounded-lg p-3'>
              <p className='text-gray-500 text-xs mb-1'>Precio medio</p>
              <p className='text-purple-400 font-bold'>{fmt3(precioMedio)} €</p>
            </div>
            <div className='bg-gray-800/50 rounded-lg p-3'>
              <p className='text-gray-500 text-xs mb-1'>{aportaciones.length} aportaciones</p>
              <p className='text-gray-300 font-bold'>{fmt2(totalInvertido / (aportaciones.length || 1))} € media</p>
            </div>
          </div>

          {/* Tabla de aportaciones individuales */}
          <div className='px-4 pb-4'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-500 pb-2 font-medium'>Fecha</th>
                  <th className='text-right text-gray-500 pb-2 font-medium'>Invertido</th>
                  <th className='text-right text-gray-500 pb-2 font-medium'>Precio</th>
                  <th className='text-right text-gray-500 pb-2 font-medium'>Participac.</th>
                  <th className='text-right text-gray-500 pb-2 font-medium'>Valor hoy</th>
                  <th className='pb-2'></th>
                </tr>
              </thead>
              <tbody>
                {aportaciones.map(a => {
                  const valorHoy = a.participaciones * precio
                  return (
                    <tr
                      key={a.id}
                      className='border-b border-gray-800/50 last:border-0'
                    >
                      <td className='py-2 text-gray-400'>{(a.fecha || '').split('-').reverse().join('-')}</td>
                      <td className='py-2 text-right text-blue-300'>{ocultar(`${fmt2(a.invertido)} €`)}</td>
                      <td className='py-2 text-right text-gray-300'>{fmt3(a.precioCompra)} €</td>
                      <td className='py-2 text-right text-cyan-400'>{fmt4(a.participaciones)}</td>
                      <td className='py-2 text-right text-gray-300'>{precio > 0 ? ocultar(`${fmt2(valorHoy)} €`) : '—'}</td>
                      <td className='py-2 text-right'>
                        <button
                          onClick={() => onEliminarAportacion(a.id)}
                          className='text-red-800 hover:text-red-500 transition-colors'
                          title='Eliminar aportación'
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DCA() {
  const { usuario } = useAuth()
  const { ocultar } = useModoPrivado()
  const [aportaciones, setAportaciones] = useState([])
  const [tickerActivo, setTickerActivo] = useState(null) // qué tarjeta está expandida
  const [error, setError] = useState('')

  // Estado del formulario nueva aportación
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    ticker: 'VUSA.DE',
    nombre: 'VUSA',
    invertido: '',
    precioCompra: ''
  })

  // ── Escucha aportaciones en Firestore ──────────────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.DCA), snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        // Retrocompatibilidad: aportaciones sin ticker → VUSA.DE
        .map(a => ({ ...a, ticker: a.ticker || 'VUSA.DE', nombre: a.nombre || 'VUSA' }))
        .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
      setAportaciones(data)
    })
    return unsub
  }, [usuario])

  // ── Extraer tickers únicos para pedir precios ──────────────────────────────
  // useMemo evita recalcular en cada render
  const tickersUnicos = useMemo(() => [...new Set(aportaciones.map(a => a.ticker))], [aportaciones])

  // Pedimos precios automáticos para todos los tickers de la cartera
  // usePreciosVivos ya acepta un array — se actualiza cuando cambia tickersUnicos
  const { precios } = usePreciosVivos(tickersUnicos)

  // ── Agrupar aportaciones por ticker ───────────────────────────────────────
  const grupos = useMemo(() => {
    const mapa = {}
    for (const a of aportaciones) {
      if (!mapa[a.ticker]) {
        mapa[a.ticker] = { ticker: a.ticker, nombre: a.nombre, aportaciones: [] }
      }
      mapa[a.ticker].aportaciones.push(a)
    }
    // Ordenar grupos por total invertido descendente
    return Object.values(mapa).sort(
      (a, b) => b.aportaciones.reduce((s, x) => s + x.invertido, 0) - a.aportaciones.reduce((s, x) => s + x.invertido, 0)
    )
  }, [aportaciones])

  // ── Totales globales de la cartera ────────────────────────────────────────
  const totales = useMemo(() => {
    let invertido = 0
    let valorActual = 0

    for (const g of grupos) {
      const precio = parseFloat(precios[g.ticker]) || 0
      const totalPart = g.aportaciones.reduce((s, a) => s + (a.participaciones || 0), 0)
      invertido += g.aportaciones.reduce((s, a) => s + (a.invertido || 0), 0)
      valorActual += totalPart * precio
    }

    const pnl = valorActual - invertido
    const pnlPct = invertido > 0 ? (pnl / invertido) * 100 : 0
    return { invertido, valorActual, pnl, pnlPct }
  }, [grupos, precios])

  // ── Guardar aportación ─────────────────────────────────────────────────────
  const añadirAportacion = async () => {
    const invertido = parseFloat(form.invertido)
    const precioCompra = parseFloat(form.precioCompra)
    const tickerLimpio = form.ticker.trim().toUpperCase()

    if (!form.fecha) return setError('Selecciona una fecha')
    if (!tickerLimpio) return setError('Introduce el ticker')
    if (!invertido || invertido <= 0) return setError('Introduce el importe invertido')
    if (!precioCompra || precioCompra <= 0) return setError('Introduce el precio de compra')

    setError('')
    const participaciones = invertido / precioCompra

    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.DCA), {
      fecha: form.fecha,
      ticker: tickerLimpio,
      nombre: form.nombre.trim() || tickerLimpio,
      invertido,
      precioCompra,
      participaciones: parseFloat(participaciones.toFixed(6)),
      fechaRegistro: serverTimestamp()
    })

    // Limpiar solo importes, mantener ticker/fecha para agilizar entradas múltiples
    setForm(f => ({ ...f, invertido: '', precioCompra: '' }))
  }

  const eliminarAportacion = async id => {
    if (!confirm('¿Eliminar esta aportación?')) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.DCA, id))
  }

  // ── Rellenar formulario al seleccionar sugerencia ─────────────────────────
  const seleccionarSugerencia = ({ ticker, nombre }) => {
    setForm(f => ({ ...f, ticker, nombre }))
    setError('')
  }

  const inputBase = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 outline-none text-gray-200 focus:border-amber-600 w-full'

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200'>Cartera Bunker</h2>
        <p className='text-gray-500 text-sm'>Inversión a largo plazo: ETFs, acciones de dividendo, DCA</p>
      </div>

      {/* ── Resumen global de la cartera ── */}
      {grupos.length > 0 && (
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <div className='bg-gray-900 border border-amber-900 rounded-xl p-4'>
            <p className='text-amber-400 text-xs font-bold uppercase tracking-wider mb-1'>Total invertido</p>
            <p className='text-white text-xl font-bold'>{ocultar(`${fmt2(totales.invertido)} €`)}</p>
          </div>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Valor actual</p>
            <p className='text-white text-xl font-bold'>{ocultar(`${fmt2(totales.valorActual)} €`)}</p>
          </div>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>P&L total</p>
            <p className={`text-xl font-bold ${totales.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {ocultar(`${totales.pnl >= 0 ? '+' : ''}${fmt2(totales.pnl)} €`)}
            </p>
          </div>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Rentabilidad</p>
            <p className={`text-xl font-bold ${totales.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {ocultar(`${totales.pnlPct >= 0 ? '+' : ''}${totales.pnlPct.toFixed(2)}%`)}
            </p>
          </div>
        </div>
      )}

      {/* ── Formulario nueva aportación ── */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
        <h3 className='text-sm font-bold text-gray-300 mb-3'>Registrar aportación</h3>

        {/* Sugerencias rápidas de ticker */}
        <div className='flex gap-2 flex-wrap mb-3'>
          {SUGERENCIAS_TICKER.map(s => (
            <button
              key={s.ticker}
              onClick={() => seleccionarSugerencia(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                form.ticker === s.ticker ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {s.nombre}
            </button>
          ))}
        </div>

        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3'>
          {/* Ticker */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Ticker (Yahoo Finance)</label>
            <input
              value={form.ticker}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              placeholder='VUSA.DE'
              className={inputBase}
            />
          </div>

          {/* Nombre corto */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Nombre corto</label>
            <input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder='VUSA'
              className={inputBase}
            />
          </div>

          {/* Fecha */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Fecha</label>
            <input
              type='date'
              value={form.fecha}
              onChange={e => {
                setError('')
                setForm(f => ({ ...f, fecha: e.target.value }))
              }}
              className={inputBase}
            />
          </div>

          {/* Invertido */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Invertido (€)</label>
            <input
              type='number'
              step='0.01'
              min='0'
              value={form.invertido}
              onChange={e => {
                setError('')
                setForm(f => ({ ...f, invertido: e.target.value }))
              }}
              placeholder='200.00'
              className='bg-gray-800 border border-blue-700 rounded-lg px-3 py-2 text-blue-300 outline-none focus:border-amber-600 w-full'
            />
          </div>

          {/* Precio de compra */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Precio compra (€)</label>
            <input
              type='number'
              step='0.001'
              min='0'
              value={form.precioCompra}
              onChange={e => {
                setError('')
                setForm(f => ({ ...f, precioCompra: e.target.value }))
              }}
              placeholder='111.485'
              className='bg-gray-800 border border-blue-700 rounded-lg px-3 py-2 text-blue-300 outline-none focus:border-amber-600 w-full'
            />
          </div>
        </div>

        {error && <p className='text-red-400 text-xs mt-2'>⚠ {error}</p>}

        <button
          onClick={añadirAportacion}
          className='mt-3 bg-amber-700 hover:bg-amber-600 text-white font-medium
                     py-2 px-5 rounded-lg transition-colors text-sm'
        >
          Añadir aportación
        </button>
      </div>

      {/* ── Cartera: una tarjeta por ticker ── */}
      {grupos.length === 0 ? (
        <p className='text-gray-500 text-center py-8'>No hay aportaciones registradas. Añade tu primera compra arriba.</p>
      ) : (
        <div className='flex flex-col gap-3'>
          <p className='text-gray-600 text-xs'>
            Toca una posición para ver el detalle de aportaciones · {grupos.length} posición{grupos.length !== 1 ? 'es' : ''}
          </p>
          {grupos.map(g => (
            <TarjetaTicker
              key={g.ticker}
              grupo={g}
              precioActual={precios[g.ticker] || 0}
              ocultar={ocultar}
              onEliminarAportacion={eliminarAportacion}
              tickerActivo={tickerActivo}
              setTickerActivo={setTickerActivo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
