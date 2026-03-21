import { useState, useEffect } from 'react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES, RIESGO_PORCENTAJE } from '../config/constants'
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react'

// Tarjeta de métrica reutilizable
function TarjetaMetrica({ titulo, valor, subtitulo, color = 'text-white' }) {
  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
      <p className='text-gray-400 text-xs mb-1'>{titulo}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
      {subtitulo && <p className='text-gray-500 text-xs mt-1'>{subtitulo}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { usuario } = useAuth()
  const [operaciones, setOperaciones] = useState([])
  const [config] = useState({ saldoInicial: 1000 })

  // Escucha operaciones en tiempo real desde Firestore
  useEffect(() => {
    if (!usuario) return

    const q = query(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES))

    const unsub = onSnapshot(q, snap => {
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return unsub
  }, [usuario])

  // Cálculos del dashboard
  const cerradas = operaciones.filter(o => o.estado === 'CERRADA')
  const abiertas = operaciones.filter(o => o.estado === 'ABIERTA')

  const pnlRealizado = cerradas.reduce((sum, o) => sum + (o.pnlEuros || 0), 0)
  const pnlVivo = abiertas.reduce((sum, o) => sum + (o.pnlVivo || 0), 0)
  const saldoRealizado = config.saldoInicial + pnlRealizado
  const saldoActual = saldoRealizado + pnlVivo
  const riesgo1pct = saldoRealizado * RIESGO_PORCENTAJE

  const ganadas = cerradas.filter(o => (o.pnlEuros || 0) > 0).length
  const winRate = cerradas.length > 0 ? (ganadas / cerradas.length) * 100 : 0

  const fmt = n => `${n.toFixed(2)} €`

  return (
    <div className='flex flex-col gap-6 py-4'>
      <h2 className='text-lg font-bold text-gray-200'>Gestión de capital</h2>

      {/* Métricas principales */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <TarjetaMetrica
          titulo='Saldo inicial'
          valor={fmt(config.saldoInicial)}
          subtitulo='Capital de partida'
        />
        <TarjetaMetrica
          titulo='Saldo actual'
          valor={fmt(saldoActual)}
          subtitulo='Incluye P&L vivo'
          color={saldoActual >= config.saldoInicial ? 'text-green-400' : 'text-red-400'}
        />
        <TarjetaMetrica
          titulo='Riesgo por op.'
          valor={fmt(riesgo1pct)}
          subtitulo='1% del saldo realizado'
          color='text-yellow-400'
        />
        <TarjetaMetrica
          titulo='Win rate'
          valor={`${winRate.toFixed(1)}%`}
          subtitulo={`${ganadas} de ${cerradas.length} cerradas`}
          color={winRate >= 50 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* P&L */}
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
        <TarjetaMetrica
          titulo='P&L realizado'
          valor={fmt(pnlRealizado)}
          subtitulo='Operaciones cerradas'
          color={pnlRealizado >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <TarjetaMetrica
          titulo='P&L vivo'
          valor={fmt(pnlVivo)}
          subtitulo='Posiciones abiertas'
          color={pnlVivo >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <TarjetaMetrica
          titulo='Posiciones abiertas'
          valor={abiertas.length}
          subtitulo='En curso ahora mismo'
          color='text-blue-400'
        />
      </div>

      {/* Tabla resumen de abiertas */}
      {abiertas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>Posiciones abiertas</h2>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left text-gray-400 p-3 font-medium'>Ticker</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Entrada</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Actual</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>P&L €</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>P&L %</th>
                </tr>
              </thead>
              <tbody>
                {abiertas.map(op => (
                  <tr
                    key={op.id}
                    className='border-b border-gray-800 last:border-0'
                  >
                    <td className='p-3 font-medium text-cyan-400'>{op.ticker}</td>
                    <td className='p-3 text-right text-gray-300'>{op.precioEntrada?.toFixed(3)}</td>
                    <td className='p-3 text-right text-yellow-400'>{op.precioActual ? op.precioActual.toFixed(3) : '—'}</td>
                    <td className={`p-3 text-right font-medium ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(op.pnlVivo || 0)}
                    </td>
                    <td className={`p-3 text-right ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {op.inversion > 0 ? `${(((op.pnlVivo || 0) / op.inversion) * 100).toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
