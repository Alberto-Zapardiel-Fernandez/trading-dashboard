// ─────────────────────────────────────────────────────────────────────────────
// Dashboard.jsx — Vista general de la cartera
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { useConfig } from '../hooks/useConfig'
import { COLECCIONES } from '../config/constants'
import { useMovimientos } from '../hooks/useMovimientos'
import EquityCurve from '../components/EquityCurve.jsx'
import { useModoPrivado } from '../context/ModoPrivadoContext'

// ── Componente: tarjeta de métrica ────────────────────────────────────────────
function Tarjeta({ titulo, valor, subtitulo, color = 'text-white' }) {
  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl p-5'>
      <p className='text-gray-400 text-sm mb-1'>{titulo}</p>
      <p className={`text-3xl font-bold ${color}`}>{valor}</p>
      {subtitulo && <p className='text-gray-500 text-sm mt-1'>{subtitulo}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { usuario } = useAuth()
  const { config, actualizarConfig } = useConfig()
  const [operaciones, setOperaciones] = useState([])

  // ── Ahora usamos los saldos separados por cuenta ──────────────────────────
  const { totalMovimientos, saldoBunker } = useMovimientos()
  const { ocultar } = useModoPrivado()

  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap =>
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return unsub
  }, [usuario])

  // ── Cálculos de operativa (solo cuenta Trading) ───────────────────────────
  const cerradas = useMemo(
    () =>
      operaciones
        .filter(o => o.estado === 'CERRADA')
        // Ordenar por fechaCierre descendente (más reciente primero) — forma robusta
        .sort((a, b) => (b.fechaCierre || '').localeCompare(a.fechaCierre || '')),
    [operaciones]
  )
  const abiertas = operaciones.filter(o => o.estado === 'ABIERTA')

  const pnlRealizado = cerradas.reduce((s, o) => s + (o.pnlEuros || 0), 0)
  const pnlVivo = abiertas.reduce((s, o) => s + (o.pnlVivo || 0), 0)

  // El saldo realizado de Trading = depósitos Trading + P&L cerrado
  // totalMovimientos ya devuelve solo el saldo de la cuenta Trading
  const saldoRealizado = totalMovimientos + pnlRealizado
  const saldoActual = saldoRealizado + pnlVivo

  const riesgo1pct = saldoRealizado * 0.01
  const ganadas = cerradas.filter(o => (o.pnlEuros || 0) > 0).length
  const winRate = cerradas.length > 0 ? (ganadas / cerradas.length) * 100 : 0

  const fmt = n => `${n.toFixed(2)} €`

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── EUR/USD ── */}
      <div className='flex items-center gap-3 flex-wrap'>
        <label className='text-gray-400 text-sm ml-4'>EUR/USD:</label>
        <input
          type='number'
          step='0.0001'
          defaultValue={config.fxEurUsd}
          onBlur={e => actualizarConfig({ fxEurUsd: parseFloat(e.target.value) || 1 })}
          className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-1.5
                     text-yellow-400 font-bold w-28 text-center'
        />
        <span className='text-gray-600 text-xs'>Se actualiza automáticamente · ajusta si lo necesitas</span>
      </div>

      {/* ── Saldos de cuentas ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200 mb-3'>Capital</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          {/* Cuenta Trading */}
          <div className='bg-gray-900 border border-blue-900 rounded-xl p-5'>
            <p className='text-blue-400 text-xs font-bold uppercase tracking-wider mb-1'>Trading</p>
            <p className={`text-3xl font-bold ${saldoActual >= 0 ? 'text-white' : 'text-red-400'}`}>{ocultar(fmt(saldoActual))}</p>
            <p className='text-gray-500 text-sm mt-1'>Depósito + P&L</p>
          </div>

          {/* Cuenta Bunker */}
          <div className='bg-gray-900 border border-amber-900 rounded-xl p-5'>
            <p className='text-amber-400 text-xs font-bold uppercase tracking-wider mb-1'>Bunker</p>
            <p className={`text-3xl font-bold ${saldoBunker >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{ocultar(fmt(saldoBunker))}</p>
            <p className='text-gray-500 text-sm mt-1'>Ahorro / largo plazo</p>
          </div>

          {/* Total consolidado */}
          <div className='bg-gray-900 border border-gray-700 rounded-xl p-5'>
            <p className='text-gray-400 text-sm mb-1'>Total consolidado</p>
            <p className={`text-3xl font-bold ${saldoActual + saldoBunker >= 0 ? 'text-white' : 'text-red-400'}`}>
              {ocultar(fmt(saldoActual + saldoBunker))}
            </p>
            <p className='text-gray-500 text-sm mt-1'>Trading + Bunker</p>
          </div>

          {/* Riesgo por operación */}
          <Tarjeta
            titulo='Riesgo por operación'
            valor={ocultar(fmt(riesgo1pct))}
            subtitulo='1% del saldo Trading'
            color='text-yellow-400'
          />
        </div>
      </div>

      {/* ── Métricas de operativa ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200 mb-3'>Operativa</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <Tarjeta
            titulo='P&L realizado'
            valor={ocultar(fmt(pnlRealizado))}
            subtitulo={`${cerradas.length} operaciones cerradas`}
            color={pnlRealizado >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='P&L vivo'
            valor={ocultar(fmt(pnlVivo))}
            subtitulo='Posiciones abiertas ahora'
            color={pnlVivo >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='Posiciones abiertas'
            valor={abiertas.length}
            subtitulo='En curso'
            color='text-blue-400'
          />
          <Tarjeta
            titulo='Win rate'
            valor={ocultar(`${winRate.toFixed(1)}%`)}
            subtitulo={`${ganadas} de ${cerradas.length} ganadoras`}
            color={winRate >= 50 ? 'text-green-400' : 'text-red-400'}
          />
        </div>
      </div>

      {/* ── Posiciones abiertas ── */}
      {abiertas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>Posiciones abiertas</h2>

          {/* Móvil: tarjetas */}
          <div className='flex flex-col gap-3 md:hidden'>
            {abiertas.map(op => (
              <div
                key={op.id}
                className='bg-gray-900 border border-blue-900 rounded-xl p-4 flex flex-col gap-2'
              >
                <div className='flex justify-between items-start'>
                  <span className='font-bold text-cyan-400 text-base'>{op.ticker}</span>
                  <span className={`text-lg font-bold ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {ocultar(fmt(op.pnlVivo || 0))}
                  </span>
                </div>
                <div className='flex gap-4 text-sm text-gray-400 flex-wrap'>
                  <span>
                    Entrada <span className='text-gray-200'>{op.precioEntrada?.toFixed(3)}</span>
                  </span>
                  <span>
                    Actual <span className='text-yellow-400'>{op.precioActual ? op.precioActual.toFixed(3) : '—'}</span>
                  </span>
                  {op.inversion > 0 && (
                    <span className={op.pnlVivo >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {ocultar(`${(((op.pnlVivo || 0) / op.inversion) * 100).toFixed(2)}%`)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Escritorio: tabla */}
          <div className='hidden md:block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-400 p-4 font-medium'>Ticker</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Entrada</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Actual</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>P&L €</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>P&L %</th>
                </tr>
              </thead>
              <tbody>
                {abiertas.map(op => (
                  <tr
                    key={op.id}
                    className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'
                  >
                    <td className='p-4 font-bold text-cyan-400'>{op.ticker}</td>
                    <td className='p-4 text-right text-gray-300'>{op.precioEntrada?.toFixed(3)}</td>
                    <td className='p-4 text-right text-yellow-400'>{op.precioActual ? op.precioActual.toFixed(3) : '—'}</td>
                    <td className={`p-4 text-right font-bold ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ocultar(fmt(op.pnlVivo || 0))}
                    </td>
                    <td className={`p-4 text-right ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {op.inversion > 0 ? ocultar(`${(((op.pnlVivo || 0) / op.inversion) * 100).toFixed(2)}%`) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Últimas 5 operaciones cerradas (más recientes primero) ── */}
      {cerradas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>
            Últimas operaciones cerradas
            <span className='text-gray-600 font-normal text-sm ml-2'>
              ({Math.min(5, cerradas.length)} de {cerradas.length})
            </span>
          </h2>

          {/* Móvil: tarjetas */}
          <div className='flex flex-col gap-3 md:hidden'>
            {cerradas.slice(0, 5).map(op => (
              <div
                key={op.id}
                className='bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-2'
              >
                <div className='flex justify-between items-start'>
                  <div>
                    <span className='font-bold text-cyan-400'>{op.ticker}</span>
                    {op.fechaCierre && <span className='text-gray-600 text-xs ml-2'>{op.fechaCierre}</span>}
                  </div>
                  <div className='text-right'>
                    <p className={`font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ocultar(`${(op.pnlEuros || 0) >= 0 ? '+' : ''}${fmt(op.pnlEuros || 0)}`)}
                    </p>
                    {op.inversion > 0 && (
                      <p className={`text-xs ${(op.pnlEuros || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {ocultar(`${(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%`)}
                      </p>
                    )}
                  </div>
                </div>
                <div className='flex gap-4 text-sm text-gray-400'>
                  <span>
                    Entrada <span className='text-gray-200'>{op.precioEntrada?.toFixed(3)}</span>
                  </span>
                  <span>
                    Cierre <span className='text-gray-200'>{op.precioCierre?.toFixed(3)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Escritorio: tabla */}
          <div className='hidden md:block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-400 p-4 font-medium'>Ticker</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Fecha cierre</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Entrada</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Cierre</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>P&L €</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>P&L %</th>
                </tr>
              </thead>
              <tbody>
                {cerradas.slice(0, 5).map(op => (
                  <tr
                    key={op.id}
                    className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'
                  >
                    <td className='p-4 font-bold text-cyan-400'>{op.ticker}</td>
                    <td className='p-4 text-right text-gray-500 text-sm'>{op.fechaCierre ?? '—'}</td>
                    <td className='p-4 text-right text-gray-300'>{op.precioEntrada?.toFixed(3)}</td>
                    <td className='p-4 text-right text-gray-300'>{op.precioCierre?.toFixed(3)}</td>
                    <td className={`p-4 text-right font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ocultar(`${(op.pnlEuros || 0) >= 0 ? '+' : ''}${fmt(op.pnlEuros || 0)}`)}
                    </td>
                    <td className={`p-4 text-right ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {op.inversion > 0 ? ocultar(`${(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%`) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Equity Curve — solo saldo Trading ── */}
      <EquityCurve
        cerradas={cerradas}
        saldoBase={totalMovimientos}
      />
    </div>
  )
}
