// src/pages/ResumenFiscal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Resumen fiscal anual: plusvalías, minusvalías y base imponible por año.
// En España las ganancias patrimoniales tributan en el ahorro:
//   hasta 6.000 €   → 19%
//   6.000–50.000 €  → 21%
//   50.000–200.000 € → 23%
//   más de 200.000 € → 27%
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES } from '../config/constants'
import { useModoPrivado } from '../context/ModoPrivadoContext'
import { exportarOperacionesCSV, exportarOperacionesExcel } from '../services/exportutils.js'

// Tramos IRPF 2024 para rentas del ahorro (ganancias patrimoniales)
const TRAMOS = [
  { hasta: 6000, tipo: 0.19, label: 'Hasta 6.000 €' },
  { hasta: 50000, tipo: 0.21, label: '6.000 € – 50.000 €' },
  { hasta: 200000, tipo: 0.23, label: '50.000 € – 200.000 €' },
  { hasta: Infinity, tipo: 0.27, label: 'Más de 200.000 €' }
]

// Calcula la cuota estimada aplicando los tramos progresivos
function calcularCuota(baseImponible) {
  if (baseImponible <= 0) return 0
  let restante = baseImponible
  let cuota = 0
  let anterior = 0

  for (const tramo of TRAMOS) {
    const tramo_base = tramo.hasta - anterior
    const aplicable = Math.min(restante, tramo_base)
    cuota += aplicable * tramo.tipo
    restante -= aplicable
    anterior = tramo.hasta
    if (restante <= 0) break
  }
  return cuota
}

// Tarjeta de métrica pequeña
function Metrica({ label, valor, color = 'text-gray-200', subtitulo }) {
  return (
    <div className='bg-gray-800/50 rounded-xl p-4'>
      <p className='text-gray-500 text-xs mb-1'>{label}</p>
      <p className={`text-xl font-bold ${color}`}>{valor}</p>
      {subtitulo && <p className='text-gray-600 text-xs mt-1'>{subtitulo}</p>}
    </div>
  )
}

export default function ResumenFiscal() {
  const { usuario } = useAuth()
  const { ocultar } = useModoPrivado()
  const [operaciones, setOperaciones] = useState([])

  // Año seleccionado — por defecto el año actual
  const anioActual = new Date().getFullYear().toString()
  const [anioSeleccionado, setAnioSeleccionado] = useState(anioActual)

  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap =>
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return unsub
  }, [usuario])

  // Años con operaciones cerradas
  const aniosDisponibles = useMemo(() => {
    const set = new Set()
    operaciones.filter(o => o.estado === 'CERRADA' && o.fechaCierre).forEach(o => set.add(o.fechaCierre.substring(0, 4)))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [operaciones])

  // Operaciones cerradas del año seleccionado
  const opsFiscales = useMemo(
    () =>
      operaciones
        .filter(o => o.estado === 'CERRADA' && o.fechaCierre?.startsWith(anioSeleccionado))
        .sort((a, b) => (b.fechaCierre || '').localeCompare(a.fechaCierre || '')),
    [operaciones, anioSeleccionado]
  )

  // Métricas fiscales del año
  const metricas = useMemo(() => {
    const ganancias = opsFiscales.filter(o => (o.pnlEuros || 0) > 0)
    const perdidas = opsFiscales.filter(o => (o.pnlEuros || 0) < 0)

    const totalGanancias = ganancias.reduce((s, o) => s + (o.pnlEuros || 0), 0)
    const totalPerdidas = perdidas.reduce((s, o) => s + (o.pnlEuros || 0), 0)
    const baseImponible = totalGanancias + totalPerdidas // pérdidas ya son negativas
    const cuotaEstimada = calcularCuota(baseImponible)
    const winRate = opsFiscales.length > 0 ? (ganancias.length / opsFiscales.length) * 100 : 0

    return {
      totalGanancias,
      totalPerdidas,
      baseImponible,
      cuotaEstimada,
      winRate,
      numGanancias: ganancias.length,
      numPerdidas: perdidas.length,
      numTotal: opsFiscales.length
    }
  }, [opsFiscales])

  const fmt = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)} €`
  const fmt2 = n => `${n.toFixed(2)} €`

  // Las operaciones filtradas se exportan directamente
  const handleExportCSV = () => exportarOperacionesCSV(opsFiscales)
  const handleExportExcel = () => exportarOperacionesExcel(opsFiscales)

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div className='flex items-start justify-between flex-wrap gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-white'>Resumen fiscal</h1>
          <p className='text-gray-500 text-sm mt-1'>Ganancias y pérdidas patrimoniales · IRPF rentas del ahorro</p>
        </div>

        {/* Selector de año */}
        <div className='flex items-center gap-3 flex-wrap'>
          <select
            value={anioSeleccionado}
            onChange={e => setAnioSeleccionado(e.target.value)}
            className='bg-gray-800 border border-gray-700 rounded-lg px-4 py-2
                       text-gray-200 text-sm outline-none focus:border-blue-500'
          >
            {aniosDisponibles.length === 0 ? (
              <option value={anioActual}>{anioActual}</option>
            ) : (
              aniosDisponibles.map(a => (
                <option
                  key={a}
                  value={a}
                >
                  {a}
                </option>
              ))
            )}
          </select>

          {opsFiscales.length > 0 && (
            <>
              <button
                onClick={handleExportCSV}
                className='border border-gray-600 hover:border-gray-400 text-gray-400
                           hover:text-gray-200 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
              >
                ↓ CSV
              </button>
              <button
                onClick={handleExportExcel}
                className='border border-green-800 hover:border-green-600 text-green-600
                           hover:text-green-400 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
              >
                ↓ Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Sin datos ── */}
      {opsFiscales.length === 0 && (
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
          <p className='text-gray-600 text-lg'>No hay operaciones cerradas en {anioSeleccionado}</p>
          <p className='text-gray-700 text-sm mt-1'>Las operaciones cerradas aparecen aquí agrupadas por año fiscal</p>
        </div>
      )}

      {opsFiscales.length > 0 && (
        <>
          {/* ── Resumen ejecutivo ── */}
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4'>
            <h2 className='text-base font-bold text-gray-300'>
              Ejercicio {anioSeleccionado}
              <span className='text-gray-600 font-normal text-sm ml-2'>· {metricas.numTotal} operaciones cerradas</span>
            </h2>

            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              <Metrica
                label='Ganancias brutas'
                valor={ocultar(`+${metricas.totalGanancias.toFixed(2)} €`)}
                color='text-green-400'
                subtitulo={`${metricas.numGanancias} operaciones ganadoras`}
              />
              <Metrica
                label='Pérdidas'
                valor={ocultar(`${metricas.totalPerdidas.toFixed(2)} €`)}
                color='text-red-400'
                subtitulo={`${metricas.numPerdidas} operaciones perdedoras`}
              />
              <Metrica
                label='Base imponible neta'
                valor={ocultar(fmt(metricas.baseImponible))}
                color={metricas.baseImponible >= 0 ? 'text-green-400' : 'text-red-400'}
                subtitulo='Ganancias − Pérdidas'
              />
              <Metrica
                label='Win rate'
                valor={ocultar(`${metricas.winRate.toFixed(1)}%`)}
                color={metricas.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
                subtitulo={`${metricas.numGanancias} de ${metricas.numTotal}`}
              />
            </div>
          </div>

          {/* ── Cuota estimada IRPF ── */}
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4'>
            <div className='flex items-start justify-between flex-wrap gap-2'>
              <div>
                <h2 className='text-base font-bold text-gray-300'>Estimación IRPF</h2>
                <p className='text-gray-600 text-xs mt-0.5'>Tramos del ahorro 2024 · Solo orientativo, consulta con un asesor fiscal</p>
              </div>
              {metricas.baseImponible > 0 && (
                <div className='text-right'>
                  <p className='text-gray-400 text-sm'>Cuota estimada</p>
                  <p className='text-red-400 text-2xl font-bold'>{ocultar(fmt2(metricas.cuotaEstimada))}</p>
                </div>
              )}
            </div>

            {/* Tabla de tramos — siempre visible para que el usuario entienda los tramos */}
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-gray-800'>
                    <th className='text-left  text-gray-500 p-3 font-medium'>Tramo</th>
                    <th className='text-right text-gray-500 p-3 font-medium'>Tipo</th>
                    <th className='text-right text-gray-500 p-3 font-medium'>Base en tramo</th>
                    <th className='text-right text-gray-500 p-3 font-medium'>Cuota parcial</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Calculamos cuánto cae en cada tramo para mostrarlo
                    const base = Math.max(metricas.baseImponible, 0)
                    let restante = base
                    let anterior = 0
                    return TRAMOS.map((tramo, i) => {
                      const tramo_base = tramo.hasta - anterior
                      const aplicable = Math.min(restante, tramo_base)
                      const cuota = aplicable * tramo.tipo
                      restante -= aplicable
                      anterior = tramo.hasta
                      const activo = aplicable > 0
                      return (
                        <tr
                          key={i}
                          className={`border-b border-gray-800 last:border-0 ${activo ? '' : 'opacity-30'}`}
                        >
                          <td className='p-3 text-gray-400'>{tramo.label}</td>
                          <td className='p-3 text-right text-gray-300'>{(tramo.tipo * 100).toFixed(0)}%</td>
                          <td className='p-3 text-right text-gray-300'>{ocultar(activo ? `${aplicable.toFixed(2)} €` : '—')}</td>
                          <td className={`p-3 text-right font-medium ${activo ? 'text-red-400' : 'text-gray-600'}`}>
                            {ocultar(activo ? `${cuota.toFixed(2)} €` : '—')}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
                {metricas.baseImponible > 0 && (
                  <tfoot>
                    <tr className='border-t border-gray-700'>
                      <td
                        colSpan={3}
                        className='p-3 text-gray-400 font-medium text-right'
                      >
                        Total cuota estimada
                      </td>
                      <td className='p-3 text-right font-bold text-red-400'>{ocultar(fmt2(metricas.cuotaEstimada))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {metricas.baseImponible <= 0 && (
              <p className='text-green-600 text-sm'>
                ✓ Base imponible negativa o cero — no hay cuota a pagar este ejercicio.
                {metricas.totalPerdidas < 0 && (
                  <span className='text-gray-500'>
                    {' '}
                    Las pérdidas ({Math.abs(metricas.totalPerdidas).toFixed(2)} €) se pueden compensar con ganancias de los 4 ejercicios siguientes.
                  </span>
                )}
              </p>
            )}
          </div>

          {/* ── Detalle de operaciones del ejercicio ── */}
          <div>
            <h2 className='text-base font-bold text-gray-300 mb-3'>Detalle de operaciones — {anioSeleccionado}</h2>

            {/* Móvil: tarjetas */}
            <div className='flex flex-col gap-2 md:hidden'>
              {opsFiscales.map(op => (
                <div
                  key={op.id}
                  className='bg-gray-900 border border-gray-800 rounded-xl px-4 py-3
                             flex flex-col gap-1'
                >
                  <div className='flex justify-between items-start'>
                    <div>
                      <span className='font-bold text-cyan-400'>{op.ticker}</span>
                      <span className='text-gray-600 text-xs ml-2'>{op.fechaCierre}</span>
                    </div>
                    <div className='text-right'>
                      <p className={`font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ocultar(fmt(op.pnlEuros || 0))}</p>
                      {op.inversion > 0 && (
                        <p className={`text-xs ${(op.pnlEuros || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {ocultar(`${(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%`)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className='flex gap-3 text-xs text-gray-500'>
                    <span>Entrada {op.precioEntrada?.toFixed(3)}</span>
                    <span>Cierre {op.precioCierre?.toFixed(3)}</span>
                    <span>{op.moneda}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Escritorio: tabla */}
            <div
              className='hidden md:block bg-gray-900 border border-gray-800
                            rounded-xl overflow-hidden'
            >
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-gray-800'>
                    <th className='text-left  text-gray-400 p-4 font-medium'>Ticker</th>
                    <th className='text-left  text-gray-400 p-4 font-medium'>Apertura</th>
                    <th className='text-left  text-gray-400 p-4 font-medium'>Cierre</th>
                    <th className='text-right text-gray-400 p-4 font-medium'>Entrada</th>
                    <th className='text-right text-gray-400 p-4 font-medium'>Cierre</th>
                    <th className='text-right text-gray-400 p-4 font-medium'>Inversión</th>
                    <th className='text-right text-gray-400 p-4 font-medium'>P&L €</th>
                    <th className='text-right text-gray-400 p-4 font-medium'>P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {opsFiscales.map(op => (
                    <tr
                      key={op.id}
                      className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'
                    >
                      <td className='p-4 font-bold text-cyan-400'>
                        {op.ticker}
                        <span className='text-gray-600 font-normal ml-1 text-xs'>{op.moneda}</span>
                      </td>
                      <td className='p-4 text-gray-500'>{op.fechaApertura ?? '—'}</td>
                      <td className='p-4 text-gray-500'>{op.fechaCierre ?? '—'}</td>
                      <td className='p-4 text-right text-gray-300'>{op.precioEntrada?.toFixed(3)}</td>
                      <td className='p-4 text-right text-gray-300'>{op.precioCierre?.toFixed(3)}</td>
                      <td className='p-4 text-right text-gray-400'>{ocultar(fmt2(op.inversion || 0))}</td>
                      <td className={`p-4 text-right font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {ocultar(fmt(op.pnlEuros || 0))}
                      </td>
                      <td className={`p-4 text-right ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {op.inversion > 0 ? ocultar(`${(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%`) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Fila de totales */}
                <tfoot>
                  <tr className='border-t border-gray-700 bg-gray-800/30'>
                    <td
                      colSpan={6}
                      className='p-4 text-gray-400 font-medium'
                    >
                      Total {anioSeleccionado}
                    </td>
                    <td className={`p-4 text-right font-bold text-lg ${metricas.baseImponible >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ocultar(fmt(metricas.baseImponible))}
                    </td>
                    <td className='p-4'></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
