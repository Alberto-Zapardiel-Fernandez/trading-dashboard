// ─────────────────────────────────────────────────────────────────────────────
// DCA.jsx — Cartera Bunker: seguimiento de inversión a largo plazo
//
// Sprint 24: se añade registro de dividendos cobrados por ticker.
//   · Formulario de dividendo dentro de cada TarjetaTicker (expandible)
//   · Al guardar un dividendo → se crea automáticamente un movimiento DIVIDENDO
//     en la cuenta BUNKER del Libro de caja (a través de useDividendos)
//   · Yield real = total dividendos del ticker / total invertido en ese ticker
//   · Resumen global de dividendos en el panel de totales
//
// MODELO DE DATOS en Firestore (users/{uid}/dca/{id}):
//   fecha          string   'YYYY-MM-DD'
//   ticker         string   Símbolo Yahoo Finance (ej: 'VUAA.DE')
//   nombre         string   Nombre corto para mostrar (ej: 'VUAA')
//   invertido      number   Importe en euros pagado
//   precioCompra   number   Precio por participación en el momento de compra
//   participaciones number  invertido / precioCompra
//   fechaRegistro  timestamp
//
// RETROCOMPATIBILIDAD:
//   Las aportaciones antiguas sin campo 'ticker' se asumen como 'VUAA.DE'
//   y nombre 'VUAA'. No hay que migrar nada en Firestore.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES } from '../config/constants'
import { usePreciosVivos } from '../hooks/usePreciosVivos'
import { useModoPrivado } from '../context/ModoPrivadoContext'
import { useDividendos } from '../hooks/useDividendos'

// ── Tickers predefinidos para sugerencias rápidas ─────────────────────────────
// El usuario puede escribir cualquier otro ticker de Yahoo Finance libremente
const SUGERENCIAS_TICKER = [
  { ticker: 'VUAA.DE', nombre: 'VUAA' },
  { ticker: 'VFEA.DE', nombre: 'VFEA' },
  { ticker: 'DFNC.DE', nombre: 'DFNC' },
  { ticker: 'LI7U.DE', nombre: 'LI7U' },
  { ticker: 'WNUC.DE', nombre: 'WNUC' }
]

// ── Utilidades de formato ─────────────────────────────────────────────────────
const fmt2 = n => (n || 0).toFixed(2)
const fmt3 = n => (n || 0).toFixed(3)
const fmt4 = n => (n || 0).toFixed(4)

// ─────────────────────────────────────────────────────────────────────────────
// Componente: Formulario para registrar un dividendo de un ticker concreto
//
// Se muestra dentro de la sección expandida de cada TarjetaTicker.
// Recibe el ticker y nombre ya rellenos, el usuario solo introduce
// el importe, las participaciones en ese momento y la fecha.
// ─────────────────────────────────────────────────────────────────────────────
function FormularioDividendo({ ticker, nombre, totalParticipaciones, onGuardar, onCancelar }) {
  const hoy = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    fecha: hoy,
    importe: '',
    // Pre-rellenamos con las participaciones actuales del grupo (editable)
    participaciones: totalParticipaciones > 0 ? fmt4(totalParticipaciones) : '',
    notas: ''
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const inputBase = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 outline-none text-gray-200 focus:border-purple-600 w-full text-sm'

  const handleGuardar = async () => {
    if (!form.fecha) return setError('Introduce la fecha de cobro')
    if (!form.importe || parseFloat(form.importe) <= 0) return setError('Introduce el importe cobrado')
    if (!form.participaciones || parseFloat(form.participaciones) <= 0) return setError('Introduce las participaciones que tenías')

    setError('')
    setGuardando(true)
    try {
      await onGuardar({
        fecha: form.fecha,
        ticker,
        nombre,
        importe: parseFloat(form.importe),
        participaciones: parseFloat(form.participaciones),
        notas: form.notas.trim()
      })
      // Limpiar solo el importe y notas al guardar — la fecha y participaciones
      // se mantienen por si el usuario quiere registrar más cobros seguidos
      setForm(f => ({ ...f, importe: '', notas: '' }))
    } catch (e) {
      setError('Error al guardar. Inténtalo de nuevo.', e)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className='bg-purple-950/30 border border-purple-900/50 rounded-xl p-4 mt-3'>
      <h4 className='text-purple-300 text-sm font-bold mb-3'>💰 Registrar dividendo de {nombre || ticker}</h4>

      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3'>
        {/* Fecha de cobro */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Fecha de cobro</label>
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

        {/* Importe cobrado */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Importe cobrado (€)</label>
          <input
            type='number'
            step='0.01'
            min='0'
            value={form.importe}
            onChange={e => {
              setError('')
              setForm(f => ({ ...f, importe: e.target.value }))
            }}
            placeholder='12.50'
            className='bg-gray-800 border border-purple-700 rounded-lg px-3 py-2 text-purple-300 outline-none focus:border-purple-500 w-full text-sm'
          />
        </div>

        {/* Participaciones que se tenían en ese momento */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Participaciones (en esa fecha)</label>
          <input
            type='number'
            step='0.0001'
            min='0'
            value={form.participaciones}
            onChange={e => {
              setError('')
              setForm(f => ({ ...f, participaciones: e.target.value }))
            }}
            placeholder={fmt4(totalParticipaciones)}
            className={inputBase}
          />
        </div>

        {/* Notas opcionales */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Notas (opcional)</label>
          <input
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder='Dividendo trimestral...'
            className={inputBase}
          />
        </div>
      </div>

      {error && <p className='text-red-400 text-xs mb-2'>⚠ {error}</p>}

      <div className='flex gap-2'>
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className='bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-medium py-1.5 px-4 rounded-lg transition-colors text-sm'
        >
          {guardando ? 'Guardando...' : 'Guardar dividendo'}
        </button>
        <button
          onClick={onCancelar}
          className='bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium py-1.5 px-4 rounded-lg transition-colors text-sm'
        >
          Cancelar
        </button>
      </div>

      <p className='text-gray-600 text-xs mt-2'>Se registrará automáticamente como DIVIDENDO en el Libro de caja (cuenta Bunker)</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente: Tarjeta resumen de un ticker
//
// Sprint 24: recibe resumenDividendos con los datos de dividendos de este ticker.
// Muestra el yield real y un historial de cobros dentro del panel expandido.
// ─────────────────────────────────────────────────────────────────────────────
function TarjetaTicker({
  grupo,
  precioActual,
  ocultar,
  onEliminarAportacion,
  tickerActivo,
  setTickerActivo,
  // Sprint 24 — nuevas props de dividendos
  dividendosTicker, // array de dividendos filtrados para este ticker
  onGuardarDividendo, // fn para guardar un dividendo nuevo
  onEliminarDividendo // fn para eliminar un dividendo
}) {
  const { ticker, nombre, aportaciones } = grupo

  const totalInvertido = aportaciones.reduce((s, a) => s + (a.invertido || 0), 0)
  const totalParticipaciones = aportaciones.reduce((s, a) => s + (a.participaciones || 0), 0)
  const precioMedio = totalParticipaciones > 0 ? totalInvertido / totalParticipaciones : 0
  const precio = parseFloat(precioActual) || 0
  const valorActual = totalParticipaciones * precio
  const pnl = valorActual - totalInvertido
  const pnlPct = totalInvertido > 0 ? (pnl / totalInvertido) * 100 : 0
  const estaAbierto = tickerActivo === ticker

  // ── Cálculos de dividendos para este ticker ────────────────────────────────
  const totalDividendosTicker = dividendosTicker.reduce((s, d) => s + (d.importe || 0), 0)
  // Yield real = dividendos cobrados / capital invertido × 100
  const yieldReal = totalInvertido > 0 && totalDividendosTicker > 0 ? (totalDividendosTicker / totalInvertido) * 100 : 0

  // Control local para mostrar/ocultar el formulario de nuevo dividendo
  const [mostrarFormDividendo, setMostrarFormDividendo] = useState(false)

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${estaAbierto ? 'border-amber-700' : 'border-gray-800'}`}>
      {/* ── Cabecera de la tarjeta (siempre visible) ── */}
      <button
        onClick={() => {
          setTickerActivo(estaAbierto ? null : ticker)
          // Si se cierra la tarjeta, también ocultamos el formulario de dividendo
          if (estaAbierto) setMostrarFormDividendo(false)
        }}
        className='w-full p-4 flex items-center justify-between gap-4 hover:bg-gray-800/50 transition-colors'
      >
        <div className='flex items-center gap-3'>
          <div className='text-left'>
            <p className='font-bold text-amber-400 text-base'>{nombre || ticker}</p>
            <p className='text-gray-600 text-xs'>{ticker}</p>
            {/* Yield real — se muestra en la cabecera si hay dividendos registrados */}
            {yieldReal > 0 && <p className='text-purple-400 text-xs font-medium'>Yield: {yieldReal.toFixed(2)}%</p>}
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

      {/* ── Métricas secundarias (solo en móvil, siempre visibles) ── */}
      <div className='px-4 pb-3 flex gap-4 text-sm sm:hidden'>
        <span className='text-gray-500'>
          Invertido <span className='text-blue-300'>{ocultar(`${fmt2(totalInvertido)} €`)}</span>
        </span>
        <span className='text-gray-500'>
          PM <span className='text-purple-400'>{fmt3(precioMedio)} €</span>
        </span>
        {yieldReal > 0 && (
          <span className='text-gray-500'>
            Yield <span className='text-purple-400'>{yieldReal.toFixed(2)}%</span>
          </span>
        )}
      </div>

      {/* ── Detalle expandible: métricas + aportaciones + dividendos ── */}
      {estaAbierto && (
        <div className='border-t border-gray-800'>
          {/* ── Métricas del grupo ── */}
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

          {/* ── Tabla de aportaciones individuales ── */}
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

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* ── SECCIÓN DIVIDENDOS (Sprint 24) ─────────────────────────── */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <div className='border-t border-gray-800 px-4 py-4'>
            <div className='flex items-center justify-between mb-3'>
              <div className='flex items-center gap-3'>
                <h4 className='text-gray-300 text-sm font-bold'>Dividendos cobrados</h4>
                {/* Resumen rápido si hay dividendos */}
                {totalDividendosTicker > 0 && (
                  <span className='bg-purple-900/40 text-purple-300 text-xs px-2 py-0.5 rounded-full'>
                    {ocultar(`${fmt2(totalDividendosTicker)} € · yield ${yieldReal.toFixed(2)}%`)}
                  </span>
                )}
              </div>
              {/* Botón para mostrar el formulario de nuevo dividendo */}
              {!mostrarFormDividendo && (
                <button
                  onClick={() => setMostrarFormDividendo(true)}
                  className='text-xs bg-purple-900/50 hover:bg-purple-800/50 text-purple-300 px-3 py-1 rounded-lg transition-colors'
                >
                  + Registrar cobro
                </button>
              )}
            </div>

            {/* Formulario de nuevo dividendo (se muestra al pulsar el botón) */}
            {mostrarFormDividendo && (
              <FormularioDividendo
                ticker={ticker}
                nombre={nombre}
                totalParticipaciones={totalParticipaciones}
                onGuardar={async datos => {
                  await onGuardarDividendo(datos)
                  setMostrarFormDividendo(false)
                }}
                onCancelar={() => setMostrarFormDividendo(false)}
              />
            )}

            {/* Historial de dividendos cobrados */}
            {dividendosTicker.length === 0 ? (
              <p className='text-gray-600 text-xs'>
                Sin dividendos registrados. {!mostrarFormDividendo && 'Pulsa "+ Registrar cobro" para añadir uno.'}
              </p>
            ) : (
              <table className='w-full text-sm mt-2'>
                <thead>
                  <tr className='border-b border-gray-800'>
                    <th className='text-left  text-gray-500 pb-2 font-medium text-xs'>Fecha</th>
                    <th className='text-right text-gray-500 pb-2 font-medium text-xs'>Importe</th>
                    <th className='text-right text-gray-500 pb-2 font-medium text-xs'>€/acción</th>
                    <th className='text-right text-gray-500 pb-2 font-medium text-xs'>Participac.</th>
                    <th className='text-left  text-gray-500 pb-2 font-medium text-xs pl-3'>Notas</th>
                    <th className='pb-2'></th>
                  </tr>
                </thead>
                <tbody>
                  {dividendosTicker.map(d => {
                    // €/acción = importe / participaciones que se tenían entonces
                    const eurPorAccion = d.participaciones > 0 ? d.importe / d.participaciones : 0
                    return (
                      <tr
                        key={d.id}
                        className='border-b border-gray-800/50 last:border-0'
                      >
                        <td className='py-2 text-gray-400 text-xs'>{(d.fecha || '').split('-').reverse().join('-')}</td>
                        <td className='py-2 text-right text-purple-300 font-medium'>{ocultar(`${fmt2(d.importe)} €`)}</td>
                        <td className='py-2 text-right text-gray-400 text-xs'>{fmt4(eurPorAccion)} €</td>
                        <td className='py-2 text-right text-gray-500 text-xs'>{fmt4(d.participaciones)}</td>
                        <td className='py-2 text-left text-gray-500 text-xs pl-3 max-w-[120px] truncate'>{d.notas || '—'}</td>
                        <td className='py-2 text-right'>
                          <button
                            onClick={() => onEliminarDividendo(d)}
                            className='text-red-800 hover:text-red-500 transition-colors text-xs'
                            title='Eliminar dividendo (también borra el movimiento vinculado)'
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          {/* ── Fin sección dividendos ─────────────────────────────────── */}
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

  // ── Hook de dividendos (Sprint 24) ────────────────────────────────────────
  const { dividendos, añadirDividendo, eliminarDividendo, totalDividendos } = useDividendos()

  // Estado del formulario nueva aportación
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    ticker: 'VUAA.DE',
    nombre: 'VUAA',
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
  const tickersUnicos = useMemo(() => [...new Set(aportaciones.map(a => a.ticker))], [aportaciones])
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

  // ── Confirmar antes de eliminar un dividendo ───────────────────────────────
  const handleEliminarDividendo = async dividendo => {
    if (!confirm(`¿Eliminar el dividendo de ${fmt2(dividendo.importe)} €?\nTambién se eliminará el movimiento del Libro de caja.`)) return
    await eliminarDividendo(dividendo)
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

          {/* ── Tarjeta de dividendos totales (Sprint 24) ── */}
          {/* Solo aparece si hay algún dividendo registrado */}
          {totalDividendos > 0 && (
            <div className='bg-gray-900 border border-purple-900 rounded-xl p-4 col-span-2 sm:col-span-1'>
              <p className='text-purple-400 text-xs font-bold uppercase tracking-wider mb-1'>Dividendos cobrados</p>
              <p className='text-purple-300 text-xl font-bold'>{ocultar(`${fmt2(totalDividendos)} €`)}</p>
              {/* Yield global = dividendos / invertido total */}
              {totales.invertido > 0 && (
                <p className='text-purple-600 text-xs mt-1'>Yield global: {((totalDividendos / totales.invertido) * 100).toFixed(2)}%</p>
              )}
            </div>
          )}
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
              placeholder='VUAA.DE'
              className={inputBase}
            />
          </div>

          {/* Nombre corto */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Nombre corto</label>
            <input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder='VUAA'
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
          className='mt-3 bg-amber-700 hover:bg-amber-600 text-white font-medium py-2 px-5 rounded-lg transition-colors text-sm'
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
            Toca una posición para ver el detalle · {grupos.length} posición{grupos.length !== 1 ? 'es' : ''} · pulsa "+ Registrar cobro" para añadir
            dividendos
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
              // Props de dividendos (Sprint 24)
              dividendosTicker={dividendos.filter(d => d.ticker === g.ticker)}
              onGuardarDividendo={añadirDividendo}
              onEliminarDividendo={handleEliminarDividendo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
