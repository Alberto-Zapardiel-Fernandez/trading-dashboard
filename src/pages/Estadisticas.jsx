// src/pages/Estadisticas.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Estadísticas avanzadas de trading calculadas sobre las operaciones cerradas.
// Todas las métricas se calculan en el frontend a partir de Firestore.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES } from '../config/constants'
import { useModoPrivado } from '../context/ModoPrivadoContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// ── Utilidades de cálculo ─────────────────────────────────────────────────────

// Días entre dos fechas YYYY-MM-DD
function diasEntre(fechaA, fechaB) {
  if (!fechaA || !fechaB) return null
  const a = new Date(fechaA)
  const b = new Date(fechaB)
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24))
}

// Racha actual y máxima de ganadoras/perdedoras consecutivas
function calcularRachas(ops) {
  if (ops.length === 0) return { rachaGanActual: 0, rachaPerActual: 0, rachaGanMax: 0, rachaPerMax: 0 }

  let rachaGanActual = 0,
    rachaPerActual = 0
  let rachaGanMax = 0,
    rachaPerMax = 0
  let rachaGanTemp = 0,
    rachaPerTemp = 0

  for (const op of ops) {
    const gana = (op.pnlEuros || 0) > 0
    if (gana) {
      rachaGanTemp++
      rachaPerTemp = 0
      rachaGanMax = Math.max(rachaGanMax, rachaGanTemp)
    } else {
      rachaPerTemp++
      rachaGanTemp = 0
      rachaPerMax = Math.max(rachaPerMax, rachaPerTemp)
    }
  }

  // Racha actual = la última racha activa
  const ultimaEsGanadora = (ops[ops.length - 1]?.pnlEuros || 0) > 0
  if (ultimaEsGanadora) {
    let i = ops.length - 1
    while (i >= 0 && (ops[i].pnlEuros || 0) > 0) {
      rachaGanActual++
      i--
    }
  } else {
    let i = ops.length - 1
    while (i >= 0 && (ops[i].pnlEuros || 0) <= 0) {
      rachaPerActual++
      i--
    }
  }

  return { rachaGanActual, rachaPerActual, rachaGanMax, rachaPerMax }
}

// Drawdown máximo: mayor caída desde un pico de equity
function calcularDrawdown(ops, saldoBase) {
  if (ops.length === 0) return { drawdownMax: 0, drawdownPct: 0 }

  let equity = saldoBase
  let pico = saldoBase
  let ddMax = 0

  for (const op of ops) {
    equity += op.pnlEuros || 0
    if (equity > pico) pico = equity
    const dd = pico - equity
    if (dd > ddMax) ddMax = dd
  }

  const ddPct = pico > 0 ? (ddMax / pico) * 100 : 0
  return { drawdownMax: ddMax, drawdownPct: ddPct }
}

// Ratio Sharpe simplificado: media(retornos) / desviación(retornos) * sqrt(252)
// Usamos retorno % por operación como proxy de retorno diario
function calcularSharpe(ops) {
  if (ops.length < 2) return null

  const retornos = ops.filter(o => o.inversion > 0).map(o => ((o.pnlEuros || 0) / o.inversion) * 100)

  if (retornos.length < 2) return null

  const media = retornos.reduce((s, r) => s + r, 0) / retornos.length
  const varianza = retornos.reduce((s, r) => s + Math.pow(r - media, 2), 0) / retornos.length
  const desv = Math.sqrt(varianza)

  if (desv === 0) return null
  // Anualizado asumiendo ~252 operaciones/año (conservador para trading activo)
  return (media / desv) * Math.sqrt(252)
}

// P&L agrupado por ticker
function calcularPorTicker(ops) {
  const mapa = {}
  for (const op of ops) {
    if (!mapa[op.ticker]) mapa[op.ticker] = { ticker: op.ticker, pnl: 0, ops: 0 }
    mapa[op.ticker].pnl += op.pnlEuros || 0
    mapa[op.ticker].ops++
  }
  return Object.values(mapa).sort((a, b) => b.pnl - a.pnl)
}

// ── Componentes UI ────────────────────────────────────────────────────────────

function Tarjeta({ titulo, valor, subtitulo, color = 'text-gray-200' }) {
  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
      <p className='text-gray-500 text-xs mb-1'>{titulo}</p>
      <p className={`text-xl font-bold ${color}`}>{valor}</p>
      {subtitulo && <p className='text-gray-600 text-xs mt-1'>{subtitulo}</p>}
    </div>
  )
}

// Tooltip personalizado para el gráfico de barras
function TooltipBarras({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm'>
      <p className='text-cyan-400 font-bold'>{d.ticker}</p>
      <p className={d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
        {d.pnl >= 0 ? '+' : ''}
        {d.pnl.toFixed(2)} €
      </p>
      <p className='text-gray-500'>{d.ops} op.</p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Estadisticas() {
  const { usuario } = useAuth()
  const { ocultar } = useModoPrivado()
  const [operaciones, setOperaciones] = useState([])
  const [saldoBase, setSaldoBase] = useState(0)

  useEffect(() => {
    if (!usuario) return

    // Operaciones
    const unsubOps = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap =>
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )

    // Saldo base desde movimientos
    const unsubMov = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), snap => {
      const total = snap.docs.reduce((s, d) => s + (d.data().importe || 0), 0)
      setSaldoBase(total)
    })

    return () => {
      unsubOps()
      unsubMov()
    }
  }, [usuario])

  // Solo operaciones cerradas ordenadas por fecha de cierre
  const cerradas = useMemo(
    () => operaciones.filter(o => o.estado === 'CERRADA').sort((a, b) => (a.fechaCierre || '').localeCompare(b.fechaCierre || '')),
    [operaciones]
  )

  // ── Cálculos ──
  const stats = useMemo(() => {
    if (cerradas.length === 0) return null

    const ganadas = cerradas.filter(o => (o.pnlEuros || 0) > 0)
    const perdidas = cerradas.filter(o => (o.pnlEuros || 0) < 0)
    const winRate = (ganadas.length / cerradas.length) * 100

    const pnlTotal = cerradas.reduce((s, o) => s + (o.pnlEuros || 0), 0)
    const pnlMedio = pnlTotal / cerradas.length

    const mejorOp = cerradas.reduce((m, o) => ((o.pnlEuros || 0) > (m.pnlEuros || 0) ? o : m), cerradas[0])
    const peorOp = cerradas.reduce((m, o) => ((o.pnlEuros || 0) < (m.pnlEuros || 0) ? o : m), cerradas[0])

    // Duración media en días (solo ops con ambas fechas)
    const duraciones = cerradas.map(o => diasEntre(o.fechaApertura, o.fechaCierre)).filter(d => d !== null)
    const duracionMedia = duraciones.length > 0 ? duraciones.reduce((s, d) => s + d, 0) / duraciones.length : null

    const rachas = calcularRachas(cerradas)
    const { drawdownMax, drawdownPct } = calcularDrawdown(cerradas, saldoBase)
    const sharpe = calcularSharpe(cerradas)
    const porTicker = calcularPorTicker(cerradas)

    // Profit factor: suma ganancias / suma abs(pérdidas)
    const sumGanancias = ganadas.reduce((s, o) => s + (o.pnlEuros || 0), 0)
    const sumPerdidas = Math.abs(perdidas.reduce((s, o) => s + (o.pnlEuros || 0), 0))
    const profitFactor = sumPerdidas > 0 ? sumGanancias / sumPerdidas : null

    return {
      winRate,
      pnlTotal,
      pnlMedio,
      mejorOp,
      peorOp,
      duracionMedia,
      rachas,
      drawdownMax,
      drawdownPct,
      sharpe,
      porTicker,
      profitFactor,
      numGanadas: ganadas.length,
      numPerdidas: perdidas.length,
      numTotal: cerradas.length
    }
  }, [cerradas, saldoBase])

  const fmt = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)} €`

  if (cerradas.length === 0) {
    return (
      <div className='flex flex-col gap-6 py-4'>
        <div>
          <h1 className='text-2xl font-bold text-white'>Estadísticas</h1>
          <p className='text-gray-500 text-sm mt-1'>Análisis avanzado de tu operativa</p>
        </div>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
          <p className='text-gray-600 text-lg'>Sin datos todavía</p>
          <p className='text-gray-700 text-sm mt-1'>Las estadísticas se calculan cuando tienes operaciones cerradas registradas</p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div>
        <h1 className='text-2xl font-bold text-white'>Estadísticas</h1>
        <p className='text-gray-500 text-sm mt-1'>Análisis avanzado de tu operativa · {stats.numTotal} operaciones cerradas</p>
      </div>

      {/* ── Sección 1: Rendimiento general ── */}
      <section>
        <h2 className='text-sm font-bold text-gray-500 uppercase tracking-wider mb-3'>Rendimiento general</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <Tarjeta
            titulo='Win rate'
            valor={ocultar(`${stats.winRate.toFixed(1)}%`)}
            subtitulo={`${stats.numGanadas}G · ${stats.numPerdidas}P de ${stats.numTotal}`}
            color={stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='P&L total'
            valor={ocultar(fmt(stats.pnlTotal))}
            subtitulo='Suma de todas las cerradas'
            color={stats.pnlTotal >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='P&L medio por op.'
            valor={ocultar(fmt(stats.pnlMedio))}
            subtitulo='Media aritmética'
            color={stats.pnlMedio >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <Tarjeta
            titulo='Profit factor'
            valor={stats.profitFactor != null ? ocultar(stats.profitFactor.toFixed(2)) : '—'}
            subtitulo='Ganancias ÷ Pérdidas · >1 es positivo'
            color={stats.profitFactor != null && stats.profitFactor >= 1 ? 'text-green-400' : 'text-red-400'}
          />
        </div>
      </section>

      {/* ── Sección 2: Rachas ── */}
      <section>
        <h2 className='text-sm font-bold text-gray-500 uppercase tracking-wider mb-3'>Rachas</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <Tarjeta
            titulo='Racha ganadora actual'
            valor={`${stats.rachas.rachaGanActual} op.`}
            color={stats.rachas.rachaGanActual > 0 ? 'text-green-400' : 'text-gray-400'}
          />
          <Tarjeta
            titulo='Racha perdedora actual'
            valor={`${stats.rachas.rachaPerActual} op.`}
            color={stats.rachas.rachaPerActual > 0 ? 'text-red-400' : 'text-gray-400'}
          />
          <Tarjeta
            titulo='Mejor racha ganadora'
            valor={`${stats.rachas.rachaGanMax} op.`}
            subtitulo='Máximo histórico'
            color='text-green-400'
          />
          <Tarjeta
            titulo='Peor racha perdedora'
            valor={`${stats.rachas.rachaPerMax} op.`}
            subtitulo='Máximo histórico'
            color='text-red-400'
          />
        </div>
      </section>

      {/* ── Sección 3: Riesgo ── */}
      <section>
        <h2 className='text-sm font-bold text-gray-500 uppercase tracking-wider mb-3'>Riesgo</h2>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <Tarjeta
            titulo='Drawdown máximo'
            valor={ocultar(`-${stats.drawdownMax.toFixed(2)} €`)}
            subtitulo={`-${stats.drawdownPct.toFixed(1)}% desde el pico`}
            color='text-red-400'
          />
          <Tarjeta
            titulo='Ratio Sharpe'
            valor={stats.sharpe != null ? stats.sharpe.toFixed(2) : '—'}
            subtitulo='>1 bueno · >2 excelente'
            color={
              stats.sharpe != null && stats.sharpe >= 1
                ? 'text-green-400'
                : stats.sharpe != null && stats.sharpe >= 0
                  ? 'text-yellow-400'
                  : 'text-red-400'
            }
          />
          <Tarjeta
            titulo='Duración media'
            valor={stats.duracionMedia != null ? `${Math.round(stats.duracionMedia)} días` : '—'}
            subtitulo='Entre apertura y cierre'
            color='text-blue-400'
          />
          <Tarjeta
            titulo='Operaciones totales'
            valor={stats.numTotal}
            subtitulo={`${stats.numGanadas} ganadoras · ${stats.numPerdidas} perdedoras`}
            color='text-gray-200'
          />
        </div>
      </section>

      {/* ── Sección 4: Mejor y peor operación ── */}
      <section>
        <h2 className='text-sm font-bold text-gray-500 uppercase tracking-wider mb-3'>Extremos</h2>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          {/* Mejor */}
          <div className='bg-gray-900 border border-green-900 rounded-xl p-4'>
            <p className='text-gray-500 text-xs mb-2'>🏆 Mejor operación</p>
            <div className='flex items-center justify-between'>
              <div>
                <span className='text-cyan-400 font-bold text-lg'>{stats.mejorOp.ticker}</span>
                <span className='text-gray-500 text-sm ml-2'>{stats.mejorOp.moneda}</span>
                <p className='text-gray-600 text-xs mt-0.5'>
                  {stats.mejorOp.fechaApertura} → {stats.mejorOp.fechaCierre}
                </p>
                {stats.mejorOp.notas && <p className='text-gray-600 text-xs italic mt-0.5'>{stats.mejorOp.notas}</p>}
              </div>
              <div className='text-right'>
                <p className='text-green-400 text-2xl font-bold'>{ocultar(`+${(stats.mejorOp.pnlEuros || 0).toFixed(2)} €`)}</p>
                {stats.mejorOp.inversion > 0 && (
                  <p className='text-green-500 text-sm'>
                    {ocultar(`+${(((stats.mejorOp.pnlEuros || 0) / stats.mejorOp.inversion) * 100).toFixed(2)}%`)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Peor */}
          <div className='bg-gray-900 border border-red-900 rounded-xl p-4'>
            <p className='text-gray-500 text-xs mb-2'>💸 Peor operación</p>
            <div className='flex items-center justify-between'>
              <div>
                <span className='text-cyan-400 font-bold text-lg'>{stats.peorOp.ticker}</span>
                <span className='text-gray-500 text-sm ml-2'>{stats.peorOp.moneda}</span>
                <p className='text-gray-600 text-xs mt-0.5'>
                  {stats.peorOp.fechaApertura} → {stats.peorOp.fechaCierre}
                </p>
                {stats.peorOp.notas && <p className='text-gray-600 text-xs italic mt-0.5'>{stats.peorOp.notas}</p>}
              </div>
              <div className='text-right'>
                <p className='text-red-400 text-2xl font-bold'>{ocultar(`${(stats.peorOp.pnlEuros || 0).toFixed(2)} €`)}</p>
                {stats.peorOp.inversion > 0 && (
                  <p className='text-red-500 text-sm'>{ocultar(`${(((stats.peorOp.pnlEuros || 0) / stats.peorOp.inversion) * 100).toFixed(2)}%`)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sección 5: P&L por ticker ── */}
      {stats.porTicker.length > 0 && (
        <section>
          <h2 className='text-sm font-bold text-gray-500 uppercase tracking-wider mb-3'>P&L por ticker</h2>

          {/* Gráfico de barras — Recharts ya instalado */}
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <ResponsiveContainer
              width='100%'
              height={Math.max(180, stats.porTicker.length * 44)}
            >
              <BarChart
                data={stats.porTicker}
                layout='vertical'
                margin={{ left: 16, right: 32, top: 4, bottom: 4 }}
              >
                <XAxis
                  type='number'
                  tickFormatter={v => `${v.toFixed(0)}€`}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type='category'
                  dataKey='ticker'
                  tick={{ fill: '#22d3ee', fontSize: 12, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip
                  content={<TooltipBarras />}
                  cursor={{ fill: '#ffffff08' }}
                />
                <Bar
                  dataKey='pnl'
                  radius={[0, 4, 4, 0]}
                  maxBarSize={28}
                >
                  {stats.porTicker.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla detalle por ticker */}
          <div className='mt-3 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-500 p-3 font-medium'>Ticker</th>
                  <th className='text-right text-gray-500 p-3 font-medium'>Operaciones</th>
                  <th className='text-right text-gray-500 p-3 font-medium'>P&L total</th>
                  <th className='text-right text-gray-500 p-3 font-medium'>P&L medio</th>
                </tr>
              </thead>
              <tbody>
                {stats.porTicker.map(t => (
                  <tr
                    key={t.ticker}
                    className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'
                  >
                    <td className='p-3 font-bold text-cyan-400'>{t.ticker}</td>
                    <td className='p-3 text-right text-gray-400'>{t.ops}</td>
                    <td className={`p-3 text-right font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ocultar(`${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} €`)}
                    </td>
                    <td className={`p-3 text-right ${t.pnl / t.ops >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ocultar(`${t.pnl / t.ops >= 0 ? '+' : ''}${(t.pnl / t.ops).toFixed(2)} €`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
