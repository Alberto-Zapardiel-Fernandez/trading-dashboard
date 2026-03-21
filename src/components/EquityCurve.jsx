// src/components/EquityCurve.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Gráfica de equity curve: muestra la evolución del saldo operación a operación.
// Cada punto = saldo base (depósitos - retiradas) + P&L acumulado hasta esa op.
// Usa Recharts (npm install recharts).
// ─────────────────────────────────────────────────────────────────────────────

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

/**
 * Construye los puntos de la gráfica a partir de las operaciones cerradas.
 * Ordena por fecha de cierre y acumula el P&L progresivamente.
 *
 * @param {Array} cerradas - Operaciones con estado CERRADA
 * @param {number} saldoBase - Total de movimientos (depósitos - retiradas)
 * @returns {Array} [{label, saldo, pnl}, ...]
 */
function construirPuntos(cerradas, saldoBase) {
  // Ordenamos por fecha de cierre (más antigua primero)
  const ordenadas = [...cerradas].sort((a, b) => new Date(a.fechaCierre) - new Date(b.fechaCierre))

  // Punto inicial: el saldo base antes de cualquier operación
  const puntos = [{ label: 'Inicio', saldo: saldoBase, pnl: 0 }]

  // Acumulamos el P&L operación a operación
  let pnlAcumulado = 0
  ordenadas.forEach(op => {
    pnlAcumulado += op.pnlEuros || 0
    puntos.push({
      // Etiqueta del eje X: ticker + fecha corta
      label: `${op.ticker} ${op.fechaCierre ? op.fechaCierre.slice(0, 10) : ''}`,
      saldo: saldoBase + pnlAcumulado,
      pnl: pnlAcumulado
    })
  })

  return puntos
}

// Tooltip personalizado que muestra saldo y P&L acumulado
function TooltipPersonalizado({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const { saldo, pnl } = payload[0].payload
  const colorPnl = pnl >= 0 ? '#4ade80' : '#f87171'

  return (
    <div className='bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm shadow-xl'>
      <p className='text-gray-300 font-medium mb-1'>{label}</p>
      <p className='text-white font-bold'>Saldo: {saldo.toFixed(2)} €</p>
      <p style={{ color: colorPnl }}>
        P&L acum.: {pnl >= 0 ? '+' : ''}
        {pnl.toFixed(2)} €
      </p>
    </div>
  )
}

export default function EquityCurve({ cerradas, saldoBase }) {
  // Si no hay operaciones cerradas, no tiene sentido mostrar la gráfica
  if (!cerradas || cerradas.length === 0) {
    return (
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-5'>
        <p className='text-gray-400 text-sm mb-1'>Equity curve</p>
        <p className='text-gray-600 text-sm'>Sin operaciones cerradas aún. Aquí verás la evolución de tu cuenta.</p>
      </div>
    )
  }

  const puntos = construirPuntos(cerradas, saldoBase)

  // Línea de referencia = saldo base (para ver si estamos por encima o por debajo)
  const lineaBase = saldoBase

  // Color del área: verde si el último punto es mayor que el inicial, rojo si no
  const ultimoSaldo = puntos[puntos.length - 1].saldo
  const colorLinea = ultimoSaldo >= saldoBase ? '#4ade80' : '#f87171'

  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl p-5'>
      <p className='text-gray-400 text-sm mb-4'>Equity curve</p>

      {/* ResponsiveContainer adapta la gráfica al ancho del contenedor */}
      <ResponsiveContainer
        width='100%'
        height={220}
      >
        <AreaChart
          data={puntos}
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          {/* Gradiente del relleno */}
          <defs>
            <linearGradient
              id='colorSaldo'
              x1='0'
              y1='0'
              x2='0'
              y2='1'
            >
              <stop
                offset='5%'
                stopColor={colorLinea}
                stopOpacity={0.3}
              />
              <stop
                offset='95%'
                stopColor={colorLinea}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray='3 3'
            stroke='#1f2937'
          />

          {/* Eje X: etiquetas cortas (solo el ticker) */}
          <XAxis
            dataKey='label'
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={v => v.split(' ')[0]} // Solo mostramos el ticker
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
          />

          {/* Eje Y: valores en euros */}
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={v => `${v.toFixed(0)}€`}
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
          />

          <Tooltip content={<TooltipPersonalizado />} />

          {/* Línea de referencia en el saldo base */}
          <ReferenceLine
            y={lineaBase}
            stroke='#4b5563'
            strokeDasharray='4 4'
            label={{ value: 'Base', fill: '#6b7280', fontSize: 10 }}
          />

          <Area
            type='monotone'
            dataKey='saldo'
            stroke={colorLinea}
            strokeWidth={2}
            fill='url(#colorSaldo)'
            dot={{ fill: colorLinea, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
