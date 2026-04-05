// ─────────────────────────────────────────────────────────────────────────────
// Dashboard.jsx — Vista general de la cartera
//
// Sprint 18: Tarjetas clicables, resumen Bunker, cerradas ordenadas
// Sprint 24: Tarjeta de dividendos cobrados en el resumen Bunker
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { useConfig } from '../hooks/useConfig'
import { COLECCIONES } from '../config/constants'
import { useMovimientos } from '../hooks/useMovimientos'
import { usePreciosVivos } from '../hooks/usePreciosVivos'
import { useDividendos } from '../hooks/useDividendos' // ← Sprint 24
import EquityCurve from '../components/EquityCurve.jsx'
import { useModoPrivado } from '../context/ModoPrivadoContext'

// ── Tarjeta clicable ──────────────────────────────────────────────────────────
function Tarjeta({ titulo, valor, subtitulo, color = 'text-white', href }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => href && navigate(href)}
      className={`bg-gray-900 border border-gray-800 rounded-xl p-5 transition-colors ${
        href ? 'cursor-pointer hover:border-gray-600 hover:bg-gray-800/60' : ''
      }`}
      title={href ? `Ir a ${titulo}` : undefined}
    >
      <p className='text-gray-400 text-sm mb-1'>{titulo}</p>
      <p className={`text-3xl font-bold ${color}`}>{valor}</p>
      {subtitulo && <p className='text-gray-500 text-sm mt-1'>{subtitulo}</p>}
      {href && <p className='text-gray-700 text-xs mt-2'>Ver detalle →</p>}
    </div>
  )
}

// ── Tarjeta de cuenta con borde de color y navegación ────────────────────────
function TarjetaCuenta({ etiqueta, colorBorde, colorTexto, valor, colorValor, subtitulo, linkLabel, href }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(href)}
      className={`bg-gray-900 border rounded-xl p-5 cursor-pointer transition-colors ${colorBorde} hover:bg-gray-800/60`}
    >
      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${colorTexto}`}>{etiqueta}</p>
      <p className={`text-3xl font-bold ${colorValor}`}>{valor}</p>
      <p className='text-gray-500 text-sm mt-1'>{subtitulo}</p>
      <p className='text-gray-700 text-xs mt-2'>{linkLabel}</p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { usuario } = useAuth()
  const { config, actualizarConfig } = useConfig()
  const [operaciones, setOperaciones] = useState([])
  const [aportacionesDca, setAportacionesDca] = useState([])

  const { totalMovimientos, saldoBunker } = useMovimientos()
  const { ocultar } = useModoPrivado()

  // ── Sprint 24: total de dividendos cobrados en la cartera Bunker ──────────
  // useDividendos ya escucha en tiempo real — solo necesitamos totalDividendos
  const { totalDividendos } = useDividendos()

  // ── Cargar operaciones ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap =>
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return unsub
  }, [usuario])

  // ── Cargar aportaciones DCA (cartera Bunker) ───────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.DCA), snap =>
      setAportacionesDca(snap.docs.map(d => ({ id: d.id, ...d.data() })).map(a => ({ ...a, ticker: a.ticker || 'VUVUAASA.DE' })))
    )
    return unsub
  }, [usuario])

  // ── Tickers únicos de la cartera Bunker para pedir precios ────────────────
  const tickersBunker = useMemo(() => [...new Set(aportacionesDca.map(a => a.ticker))], [aportacionesDca])
  const { precios: preciosBunker } = usePreciosVivos(tickersBunker)

  // ── Cálculos operativa (cuenta Trading) ───────────────────────────────────
  const cerradas = useMemo(
    () => operaciones.filter(o => o.estado === 'CERRADA').sort((a, b) => (b.fechaCierre || '').localeCompare(a.fechaCierre || '')),
    [operaciones]
  )
  const abiertas = operaciones.filter(o => o.estado === 'ABIERTA')

  const pnlRealizado = cerradas.reduce((s, o) => s + (o.pnlEuros || 0), 0)
  const pnlVivo = abiertas.reduce((s, o) => s + (o.pnlVivo || 0), 0)

  // totalMovimientos ya incluye el P&L de operaciones cerradas desde useMovimientos.
  // Solo sumamos el P&L vivo (posiciones aún abiertas) para el saldo en tiempo real.
  const saldoActual = totalMovimientos + pnlVivo
  const riesgo3pct = totalMovimientos * 0.03
  const ganadas = cerradas.filter(o => (o.pnlEuros || 0) > 0).length
  const winRate = cerradas.length > 0 ? (ganadas / cerradas.length) * 100 : 0

  // ── Cálculos cartera Bunker ────────────────────────────────────────────────
  const resumenBunker = useMemo(() => {
    let invertido = 0
    let valorActual = 0

    const grupos = {}
    for (const a of aportacionesDca) {
      if (!grupos[a.ticker]) grupos[a.ticker] = { invertido: 0, participaciones: 0 }
      grupos[a.ticker].invertido += a.invertido || 0
      grupos[a.ticker].participaciones += a.participaciones || 0
    }
    for (const [ticker, g] of Object.entries(grupos)) {
      const precio = parseFloat(preciosBunker[ticker]) || 0
      invertido += g.invertido
      valorActual += g.participaciones * precio
    }

    const pnl = valorActual - invertido
    const pnlPct = invertido > 0 ? (pnl / invertido) * 100 : 0
    return { invertido, valorActual, pnl, pnlPct, numPositiones: Object.keys(grupos).length }
  }, [aportacionesDca, preciosBunker])

  const fmt = n => `${(n || 0).toFixed(2)} €`

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

      {/* ── Capital: las dos cuentas ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200 mb-3'>Capital</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <TarjetaCuenta
            etiqueta='Trading'
            colorBorde='border-blue-900 hover:border-blue-700'
            colorTexto='text-blue-400'
            valor={ocultar(fmt(saldoActual))}
            colorValor={saldoActual >= 0 ? 'text-white' : 'text-red-400'}
            subtitulo='Depósito + P&L'
            linkLabel='Ver libro de caja →'
            href='/movimientos'
          />
          <TarjetaCuenta
            etiqueta='Bunker'
            colorBorde='border-amber-900 hover:border-amber-700'
            colorTexto='text-amber-400'
            valor={ocultar(fmt(saldoBunker))}
            colorValor={saldoBunker >= 0 ? 'text-amber-400' : 'text-red-400'}
            subtitulo='Ahorro / largo plazo'
            linkLabel='Ver cartera →'
            href='/dca'
          />
          <div className='bg-gray-900 border border-gray-700 rounded-xl p-5'>
            <p className='text-gray-400 text-sm mb-1'>Total consolidado</p>
            <p className={`text-3xl font-bold ${saldoActual + saldoBunker >= 0 ? 'text-white' : 'text-red-400'}`}>
              {ocultar(fmt(saldoActual + saldoBunker))}
            </p>
            <p className='text-gray-500 text-sm mt-1'>Trading + Bunker</p>
          </div>
          <Tarjeta
            titulo='Riesgo por operación'
            valor={ocultar(fmt(riesgo3pct))}
            subtitulo='3% del saldo Trading'
            color='text-yellow-400'
          />
        </div>
      </div>

      {/* ── Resumen cartera Bunker ── */}
      {aportacionesDca.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>
            Cartera Bunker
            <span className='text-gray-600 font-normal text-sm ml-2'>
              {resumenBunker.numPositiones} posición{resumenBunker.numPositiones !== 1 ? 'es' : ''}
            </span>
          </h2>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <Tarjeta
              titulo='Invertido'
              valor={ocultar(fmt(resumenBunker.invertido))}
              subtitulo='Capital aportado'
              color='text-amber-400'
              href='/dca'
            />
            <Tarjeta
              titulo='Valor actual'
              valor={ocultar(fmt(resumenBunker.valorActual))}
              subtitulo='A precios de mercado'
              color='text-white'
              href='/dca'
            />
            <Tarjeta
              titulo='P&L Bunker'
              valor={ocultar(`${resumenBunker.pnl >= 0 ? '+' : ''}${fmt(resumenBunker.pnl)}`)}
              subtitulo='Latente no realizado'
              color={resumenBunker.pnl >= 0 ? 'text-green-400' : 'text-red-400'}
              href='/dca'
            />
            <Tarjeta
              titulo='Rentabilidad'
              valor={ocultar(`${resumenBunker.pnlPct >= 0 ? '+' : ''}${resumenBunker.pnlPct.toFixed(2)}%`)}
              subtitulo='Sobre capital invertido'
              color={resumenBunker.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}
              href='/dca'
            />

            {/* ── Sprint 24: Dividendos cobrados ── */}
            {/* Solo aparece cuando hay dividendos registrados */}
            {totalDividendos > 0 && (
              <div
                onClick={() => {
                  /* navega a /dca */
                }}
                className='bg-gray-900 border border-purple-900 rounded-xl p-5 cursor-pointer
                           hover:border-purple-700 hover:bg-gray-800/60 transition-colors'
                // Usamos un div clicable igual que Tarjeta pero con estilo púrpura
                // No reutilizamos Tarjeta porque queremos el color de borde especial
              >
                <p className='text-gray-400 text-sm mb-1'>Dividendos cobrados</p>
                <p className='text-purple-300 text-3xl font-bold'>{ocultar(fmt(totalDividendos))}</p>
                {resumenBunker.invertido > 0 && (
                  <p className='text-purple-600 text-sm mt-1'>Yield: {((totalDividendos / resumenBunker.invertido) * 100).toFixed(2)}%</p>
                )}
                <p className='text-gray-700 text-xs mt-2'>Ver cartera →</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Operativa Trading ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200 mb-3'>Operativa</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <Tarjeta
            titulo='P&L realizado'
            valor={ocultar(fmt(pnlRealizado))}
            subtitulo={`${cerradas.length} operaciones cerradas`}
            color={pnlRealizado >= 0 ? 'text-green-400' : 'text-red-400'}
            href='/estadisticas'
          />
          <Tarjeta
            titulo='P&L vivo'
            valor={ocultar(fmt(pnlVivo))}
            subtitulo='Posiciones abiertas ahora'
            color={pnlVivo >= 0 ? 'text-green-400' : 'text-red-400'}
            href='/historico'
          />
          <Tarjeta
            titulo='Posiciones abiertas'
            valor={abiertas.length}
            subtitulo='En curso'
            color='text-blue-400'
            href='/historico'
          />
          <Tarjeta
            titulo='Win rate'
            valor={ocultar(`${winRate.toFixed(1)}%`)}
            subtitulo={`${ganadas} de ${cerradas.length} ganadoras`}
            color={winRate >= 50 ? 'text-green-400' : 'text-red-400'}
            href='/estadisticas'
          />
        </div>
      </div>

      {/* ── Posiciones abiertas ── */}
      {abiertas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>Posiciones abiertas</h2>

          {/* Móvil */}
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

          {/* Escritorio */}
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

      {/* ── Últimas 5 operaciones cerradas ── */}
      {cerradas.length > 0 && (
        <div>
          <h2 className='text-lg font-bold text-gray-200 mb-3'>
            Últimas operaciones cerradas
            <span className='text-gray-600 font-normal text-sm ml-2'>
              ({Math.min(5, cerradas.length)} de {cerradas.length})
            </span>
          </h2>

          {/* Móvil */}
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

          {/* Escritorio */}
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

      {/* ── Equity Curve — solo cuenta Trading ── */}
      <EquityCurve
        cerradas={cerradas}
        saldoBase={totalMovimientos}
      />
    </div>
  )
}
