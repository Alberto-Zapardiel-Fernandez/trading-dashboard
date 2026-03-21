import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { useConfig } from '../hooks/useConfig'
import { COLECCIONES } from '../config/constants'
import { useMovimientos } from '../hooks/useMovimientos'
import EquityCurve from '../components/EquityCurve.jsx'

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
  const { totalMovimientos } = useMovimientos()

  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap =>
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return unsub
  }, [usuario])

  const cerradas = operaciones.filter(o => o.estado === 'CERRADA')
  const abiertas = operaciones.filter(o => o.estado === 'ABIERTA')
  const pnlRealizado = cerradas.reduce((s, o) => s + (o.pnlEuros || 0), 0)
  const pnlVivo = abiertas.reduce((s, o) => s + (o.pnlVivo || 0), 0)
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
          className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-1.5 text-yellow-400 font-bold w-28 text-center'
        />
        <span className='text-gray-600 text-xs'>Se actualiza automáticamente · ajusta si lo necesitas</span>
      </div>

      {/* ── Métricas de capital ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200 mb-3'>Gestión de capital</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <Tarjeta
            titulo='Saldo actual'
            valor={fmt(saldoActual)}
            subtitulo='Inicial + cerradas + vivo'
            color={saldoActual >= config.saldoInicial ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='Riesgo por operación'
            valor={fmt(riesgo1pct)}
            subtitulo='1% del saldo realizado'
            color='text-yellow-400'
          />
          <Tarjeta
            titulo='P&L realizado'
            valor={fmt(pnlRealizado)}
            subtitulo={`${cerradas.length} operaciones cerradas`}
            color={pnlRealizado >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='Win rate'
            valor={`${winRate.toFixed(1)}%`}
            subtitulo={`${ganadas} de ${cerradas.length} ganadoras`}
            color={winRate >= 50 ? 'text-green-400' : 'text-red-400'}
          />
        </div>
      </div>

      {/* ── P&L vivo ── */}
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
        <Tarjeta
          titulo='P&L vivo'
          valor={fmt(pnlVivo)}
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
          titulo='P&L total'
          valor={fmt(pnlRealizado + pnlVivo)}
          subtitulo='Realizado + latente'
          color={pnlRealizado + pnlVivo >= 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* ── Posiciones abiertas ── */}
      {abiertas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>Posiciones abiertas</h2>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left   text-gray-400 p-4 font-medium'>Ticker</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>Entrada</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>Actual</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>P&L €</th>
                  <th className='text-right  text-gray-400 p-4 font-medium'>P&L %</th>
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
                      {fmt(op.pnlVivo || 0)}
                    </td>
                    <td className={`p-4 text-right ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {op.inversion > 0 ? `${(((op.pnlVivo || 0) / op.inversion) * 100).toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Últimas operaciones cerradas ── */}
      {cerradas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>Últimas operaciones cerradas</h2>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-400 p-4 font-medium'>Ticker</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Entrada</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Cierre</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>P&L €</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>P&L %</th>
                </tr>
              </thead>
              <tbody>
                {cerradas
                  .slice(-5)
                  .reverse()
                  .map(op => (
                    <tr
                      key={op.id}
                      className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'
                    >
                      <td className='p-4 font-bold text-cyan-400'>{op.ticker}</td>
                      <td className='p-4 text-right text-gray-300'>{op.precioEntrada?.toFixed(3)}</td>
                      <td className='p-4 text-right text-gray-300'>{op.precioCierre?.toFixed(3)}</td>
                      <td className={`p-4 text-right font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(op.pnlEuros || 0) >= 0 ? '+' : ''}
                        {fmt(op.pnlEuros || 0)}
                      </td>
                      <td className={`p-4 text-right ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {op.inversion > 0 ? `${(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Equity curve ── */}
      <EquityCurve
        cerradas={cerradas}
        saldoBase={totalMovimientos}
      />
    </div>
  )
}
