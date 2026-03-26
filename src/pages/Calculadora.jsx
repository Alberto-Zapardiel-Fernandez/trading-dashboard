// ─────────────────────────────────────────────────────────────────────────────
// Calculadora.jsx — Calculadora de entrada de posiciones
//
// CAMBIOS Sprint 19:
//   · Modo automático (stop → calcula acciones) vs manual (acciones → calcula riesgo)
//   · Tabla de Take Profits automáticos: 1:1, 1.5:1, 2:1, 2.5:1, 3:1
//   · Hint del campo precio objetivo se rellena con el TP 2:1
//   · Saldo real conectado a useMovimientos (ya no hardcodeado a 1000)
//   · FX EUR/USD leído de useConfig (igual que el Dashboard)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { db } from '../config/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { COLECCIONES } from '../config/constants'
import { useMovimientos } from '../hooks/useMovimientos'
import { useConfig } from '../hooks/useConfig'

// Niveles de stop predefinidos para la tabla de referencia (1%–10%)
const NIVELES_STOP = [
  { pct: 0.01, label: 'Conservador', color: 'text-green-400' },
  { pct: 0.02, label: 'Moderado', color: 'text-cyan-400' },
  { pct: 0.03, label: 'Moderado+', color: 'text-yellow-300' },
  { pct: 0.04, label: 'Amplio', color: 'text-yellow-400' },
  { pct: 0.05, label: 'Agresivo', color: 'text-orange-400' },
  { pct: 0.06, label: 'Agresivo+', color: 'text-orange-500' },
  { pct: 0.07, label: 'Muy agresivo', color: 'text-red-400' },
  { pct: 0.08, label: 'Muy agresivo+', color: 'text-red-500' },
  { pct: 0.09, label: 'Extremo', color: 'text-red-600' },
  { pct: 0.1, label: 'Máximo', color: 'text-red-700' }
]

// Ratios de Take Profit a mostrar en la tabla
const RATIOS_TP = [1, 1.5, 2, 2.5, 3]

export default function Calculadora() {
  const { usuario } = useAuth()
  const { totalMovimientos } = useMovimientos() // saldo Trading real
  const { config } = useConfig() // para leer fxEurUsd guardado

  // ── Modo: 'auto' (stop → acciones) | 'manual' (acciones → riesgo) ─────────
  const [modo, setModo] = useState('auto')

  // ── Formulario ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    ticker: '',
    moneda: 'EUR',
    precioEntrada: '',
    stopLoss: '',
    numAcciones: '', // solo en modo manual
    precioObjetivo: ''
  })

  // FX EUR/USD — se inicializa con el valor guardado en config, editable a mano
  const [fxEurUsd, setFxEurUsd] = useState(config.fxEurUsd || 1.15)

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // ── Valores parseados ─────────────────────────────────────────────────────
  const entrada = parseFloat(form.precioEntrada) || 0
  const stop = parseFloat(form.stopLoss) || 0
  const accionesManual = parseFloat(form.numAcciones) || 0
  const objetivo = parseFloat(form.precioObjetivo) || 0

  // El saldo realizado viene de Firestore a través de useMovimientos
  // Si aún no hay movimientos, usamos 0 (el riesgo saldrá en 0)
  const saldoRealizado = totalMovimientos
  const riesgo1pct = saldoRealizado * 0.01

  // ── Cálculo en modo AUTOMÁTICO ────────────────────────────────────────────
  // El usuario pone entrada + stop → calculamos cuántas acciones comprar
  // para no arriesgar más del 1% del saldo
  const distanciaEuros = entrada > stop && entrada > 0 && stop > 0 ? (form.moneda === 'USD' ? (entrada - stop) / fxEurUsd : entrada - stop) : 0

  const accionesAuto = distanciaEuros > 0 ? riesgo1pct / distanciaEuros : 0
  const inversionAuto = form.moneda === 'USD' ? (accionesAuto * entrada) / fxEurUsd : accionesAuto * entrada

  // ── Cálculo en modo MANUAL ────────────────────────────────────────────────
  // El usuario ya sabe cuántas acciones va a comprar (o ya las tiene)
  // → calculamos el riesgo real que asume con ese stop
  const inversionManual = form.moneda === 'USD' ? (accionesManual * entrada) / fxEurUsd : accionesManual * entrada

  const riesgoManual = distanciaEuros > 0 ? accionesManual * distanciaEuros : 0

  const pctRiesgoManual = saldoRealizado > 0 && riesgoManual > 0 ? (riesgoManual / saldoRealizado) * 100 : 0

  // ── Valores efectivos según modo ──────────────────────────────────────────
  const accionesEfectivas = modo === 'auto' ? accionesAuto : accionesManual
  const inversionEfectiva = modo === 'auto' ? inversionAuto : inversionManual
  const riesgoEfectivo = modo === 'auto' ? riesgo1pct : riesgoManual

  // ── Ratio R/B y beneficio previsto (con precio objetivo manual) ───────────
  const ratioRB =
    objetivo > entrada && distanciaEuros > 0 ? (form.moneda === 'USD' ? (objetivo - entrada) / fxEurUsd : objetivo - entrada) / distanciaEuros : 0

  const beneficioPrevisto =
    objetivo > entrada && accionesEfectivas > 0
      ? form.moneda === 'USD'
        ? ((objetivo - entrada) * accionesEfectivas) / fxEurUsd
        : (objetivo - entrada) * accionesEfectivas
      : 0

  // ── Take Profits automáticos (desde el stop, múltiplos del riesgo) ─────────
  // TP 2:1 → precio donde el beneficio = 2 × riesgo por acción
  // Solo tiene sentido si hay entrada y stop definidos
  const calcularTP = ratio => {
    if (!entrada || !stop || entrada <= stop) return null
    const distPorAccion = entrada - stop // en moneda del activo
    const precioTP = entrada + distPorAccion * ratio
    const beneficioEuros = form.moneda === 'USD' ? (distPorAccion * ratio * accionesEfectivas) / fxEurUsd : distPorAccion * ratio * accionesEfectivas
    return { precio: precioTP, beneficio: beneficioEuros }
  }

  // Hint para el campo "precio objetivo": sugerimos el TP 2:1
  const tp2a1 = calcularTP(2)

  // ── Guardar operación ─────────────────────────────────────────────────────
  const guardarOperacion = async () => {
    if (!form.ticker || !entrada || !stop) return
    if (modo === 'manual' && !accionesManual) return

    const accionesGuardar = parseFloat(accionesEfectivas.toFixed(4))
    const inversionGuardar = parseFloat(inversionEfectiva.toFixed(2))

    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), {
      ticker: form.ticker.toUpperCase(),
      moneda: form.moneda,
      precioEntrada: entrada,
      stopLoss: stop,
      precioObjetivo: objetivo || null,
      numAcciones: accionesGuardar,
      inversion: inversionGuardar,
      fxCompra: form.moneda === 'USD' ? fxEurUsd : 1,
      estado: 'ABIERTA',
      pnlVivo: 0,
      precioActual: null,
      notas: modo === 'manual' ? '(entrada manual)' : '',
      fechaApertura: new Date().toISOString().split('T')[0],
      creadoEn: serverTimestamp()
    })

    setForm({ ticker: '', moneda: 'EUR', precioEntrada: '', stopLoss: '', numAcciones: '', precioObjetivo: '' })
    alert(`✅ Operación ${form.ticker.toUpperCase()} guardada como ABIERTA en el histórico`)
  }

  const fmt2 = n => (n || 0).toFixed(2)
  const fmt3 = n => (n || 0).toFixed(3)

  const hayResultados = entrada > 0 && stop > 0 && entrada > stop && (modo === 'auto' || accionesManual > 0)

  return (
    <div className='flex flex-col gap-6 py-4'>
      <div>
        <h2 className='text-lg font-bold text-gray-200'>Calculadora de entrada</h2>
        <p className='text-gray-500 text-sm'>Calcula el tamaño de posición para no arriesgar más del 1%</p>
      </div>

      {/* ── EUR/USD ── */}
      <div className='flex items-center gap-3 flex-wrap'>
        <label className='text-gray-400 text-sm'>EUR/USD:</label>
        <input
          type='number'
          step='0.0001'
          value={fxEurUsd}
          onChange={e => setFxEurUsd(parseFloat(e.target.value) || 1)}
          className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-1.5
                     text-yellow-400 font-bold w-28 text-center'
        />
        <span className='text-gray-500 text-xs'>
          Saldo Trading: <span className='text-white font-medium'>{fmt2(saldoRealizado)} €</span>
          {' · '}Riesgo 1%: <span className='text-yellow-400 font-medium'>{fmt2(riesgo1pct)} €</span>
        </span>
      </div>

      {/* ── Toggle modo auto / manual ── */}
      <div className='flex items-center gap-2'>
        <span className='text-gray-400 text-sm'>Modo:</span>
        <div className='flex bg-gray-800 rounded-lg p-0.5 gap-0.5'>
          <button
            onClick={() => setModo('auto')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              modo === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Automático
          </button>
          <button
            onClick={() => setModo('manual')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              modo === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Manual
          </button>
        </div>
        <span className='text-gray-600 text-xs'>
          {modo === 'auto' ? 'Introduce stop → calcula las acciones que necesitas' : 'Introduce acciones → calcula el riesgo que asumes'}
        </span>
      </div>

      {/* ── Formulario ── */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
          {/* Ticker */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Ticker</label>
            <input
              value={form.ticker}
              onChange={e => set('ticker', e.target.value)}
              placeholder='AAPL, SAN.MC...'
              className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                         text-cyan-400 font-medium focus:border-blue-500 outline-none'
            />
          </div>

          {/* Moneda */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Moneda</label>
            <select
              value={form.moneda}
              onChange={e => set('moneda', e.target.value)}
              className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                         text-yellow-400 font-medium focus:border-blue-500 outline-none'
            >
              <option value='EUR'>EUR</option>
              <option value='USD'>USD</option>
            </select>
          </div>

          {/* Precio entrada */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Precio de entrada</label>
            <input
              type='number'
              step='0.001'
              value={form.precioEntrada}
              onChange={e => set('precioEntrada', e.target.value)}
              placeholder='0.000'
              className='bg-gray-800 border border-blue-700 rounded-lg px-3 py-2
                         text-blue-300 focus:border-blue-500 outline-none'
            />
          </div>

          {/* Stop Loss */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Stop loss (precio)</label>
            <input
              type='number'
              step='0.001'
              value={form.stopLoss}
              onChange={e => set('stopLoss', e.target.value)}
              placeholder='0.000'
              className='bg-gray-800 border border-red-800 rounded-lg px-3 py-2
                         text-red-400 focus:border-red-500 outline-none'
            />
          </div>

          {/* Nº acciones — solo en modo manual */}
          {modo === 'manual' && (
            <div className='flex flex-col gap-1'>
              <label className='text-gray-400 text-xs'>Nº acciones (a comprar)</label>
              <input
                type='number'
                step='1'
                min='0'
                value={form.numAcciones}
                onChange={e => set('numAcciones', e.target.value)}
                placeholder='50'
                className='bg-gray-800 border border-cyan-700 rounded-lg px-3 py-2
                           text-cyan-400 focus:border-cyan-500 outline-none'
              />
            </div>
          )}

          {/* Precio objetivo — hint con TP 2:1 */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>
              Precio objetivo
              {tp2a1 && <span className='text-gray-600 ml-1'>(2:1 → {fmt3(tp2a1.precio)})</span>}
            </label>
            <input
              type='number'
              step='0.001'
              value={form.precioObjetivo}
              onChange={e => set('precioObjetivo', e.target.value)}
              placeholder={tp2a1 ? fmt3(tp2a1.precio) : 'Opcional'}
              className='bg-gray-800 border border-green-800 rounded-lg px-3 py-2
                         text-green-400 focus:border-green-500 outline-none'
            />
          </div>
        </div>
      </div>

      {/* ── Resultados calculados ── */}
      {hayResultados && (
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>{modo === 'auto' ? 'Nº acciones' : 'Nº acciones (manual)'}</p>
            <p className='text-cyan-400 text-2xl font-bold'>{modo === 'auto' ? fmt2(accionesEfectivas) : accionesManual}</p>
            {modo === 'auto' && <p className='text-gray-600 text-xs mt-1'>Recomendado por el sistema</p>}
          </div>

          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Inversión total</p>
            <p className='text-white text-2xl font-bold'>{fmt2(inversionEfectiva)} €</p>
          </div>

          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Riesgo real</p>
            <p className={`text-2xl font-bold ${modo === 'manual' && pctRiesgoManual > 1.5 ? 'text-red-400' : 'text-orange-400'}`}>
              {fmt2(riesgoEfectivo)} €
            </p>
            {modo === 'manual' && (
              <p className={`text-xs mt-1 ${pctRiesgoManual > 1.5 ? 'text-red-500' : 'text-gray-500'}`}>
                {pctRiesgoManual.toFixed(2)}% del saldo
                {pctRiesgoManual > 1.5 && ' ⚠ supera el 1.5%'}
              </p>
            )}
          </div>

          {ratioRB > 0 ? (
            <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
              <p className='text-gray-400 text-xs mb-1'>Ratio R/B (objetivo manual)</p>
              <p className='text-green-400 text-2xl font-bold'>1:{fmt2(ratioRB)}</p>
              <p className='text-gray-500 text-xs mt-1'>Beneficio: {fmt2(beneficioPrevisto)} €</p>
            </div>
          ) : (
            <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
              <p className='text-gray-400 text-xs mb-1'>Ratio R/B</p>
              <p className='text-gray-600 text-lg'>—</p>
              <p className='text-gray-700 text-xs mt-1'>Introduce un precio objetivo</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tabla de Take Profits automáticos ── */}
      {hayResultados && entrada > stop && (
        <div>
          <h3 className='text-base font-bold text-gray-200 mb-3'>
            Take Profits automáticos
            <span className='text-gray-600 font-normal text-sm ml-2'>— calculados desde el stop ({fmt3(stop)})</span>
          </h3>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-400 p-3 font-medium'>Ratio</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Precio TP</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Distancia</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Beneficio €</th>
                  <th className='text-right text-gray-400 p-3 font-medium hidden sm:table-cell'>% sobre inversión</th>
                </tr>
              </thead>
              <tbody>
                {RATIOS_TP.map(ratio => {
                  const tp = calcularTP(ratio)
                  if (!tp) return null
                  const distancia = tp.precio - entrada
                  const pctInversion = inversionEfectiva > 0 ? (tp.beneficio / inversionEfectiva) * 100 : 0
                  // Color progresivo según ratio
                  const color = ratio <= 1 ? 'text-yellow-400' : ratio <= 2 ? 'text-green-400' : 'text-emerald-400'

                  return (
                    <tr
                      key={ratio}
                      className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/50 ${
                        // Resaltar el 2:1 como recomendado
                        ratio === 2 ? 'bg-green-900/10' : ''
                      }`}
                    >
                      <td className={`p-3 font-bold ${color}`}>
                        {ratio}:1
                        {ratio === 2 && <span className='text-gray-600 font-normal text-xs ml-2'>recomendado</span>}
                      </td>
                      <td className={`p-3 text-right font-medium ${color}`}>{fmt3(tp.precio)}</td>
                      <td className='p-3 text-right text-gray-400'>+{fmt3(distancia)}</td>
                      <td className={`p-3 text-right font-bold ${color}`}>+{fmt2(tp.beneficio)} €</td>
                      <td className='p-3 text-right text-gray-500 hidden sm:table-cell'>{pctInversion.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Botón guardar ── */}
      {hayResultados && (
        <div className='flex items-center gap-4 flex-wrap'>
          <button
            onClick={guardarOperacion}
            className='bg-blue-600 hover:bg-blue-700 text-white font-medium
                       py-3 px-6 rounded-xl transition-colors'
          >
            Guardar como operación abierta →
          </button>
          <p className='text-gray-600 text-sm'>
            Se guardará en el Histórico con estado <span className='text-blue-400'>ABIERTA</span>
          </p>
        </div>
      )}

      {/* ── Tabla de referencia: niveles de stop ── */}
      {entrada > 0 && (
        <div>
          <h3 className='text-base font-bold text-gray-200 mb-3'>
            Referencia de stops
            <span className='text-gray-600 font-normal text-sm ml-2'>
              — riesgo fijo {fmt2(riesgo1pct)} € (1% de {fmt2(saldoRealizado)} €)
            </span>
          </h3>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-400 p-3 font-medium'>% Stop</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Precio stop</th>
                  <th className='text-right text-gray-400 p-3 font-medium hidden sm:table-cell'>Distancia</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Nº acciones</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Inversión €</th>
                  <th className='text-right text-gray-400 p-3 font-medium hidden sm:table-cell'>Nivel</th>
                </tr>
              </thead>
              <tbody>
                {NIVELES_STOP.map(({ pct, label, color }) => {
                  const precioStop = entrada * (1 - pct)
                  const dist = entrada - precioStop
                  const distE = form.moneda === 'USD' ? dist / fxEurUsd : dist
                  const acciones = distE > 0 ? riesgo1pct / distE : 0
                  const inv = form.moneda === 'USD' ? (acciones * entrada) / fxEurUsd : acciones * entrada
                  // Destacar la fila que coincide con el stop introducido
                  const esActual = stop > 0 && Math.abs(precioStop - stop) < 0.01 * entrada

                  return (
                    <tr
                      key={pct}
                      className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/50 ${esActual ? 'bg-blue-900/20' : ''}`}
                    >
                      <td className={`p-3 font-bold ${color}`}>{(pct * 100).toFixed(0)}%</td>
                      <td className={`p-3 text-right ${color}`}>{fmt3(precioStop)}</td>
                      <td className='p-3 text-right text-gray-400 hidden sm:table-cell'>{fmt3(dist)}</td>
                      <td className={`p-3 text-right font-bold ${color}`}>{fmt2(acciones)}</td>
                      <td className='p-3 text-right text-gray-300'>{fmt2(inv)} €</td>
                      <td className={`p-3 text-right font-medium ${color} hidden sm:table-cell`}>{label}</td>
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
