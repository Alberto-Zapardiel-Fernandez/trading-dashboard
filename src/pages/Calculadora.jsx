import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { db } from '../config/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { COLECCIONES } from '../config/constants'

export default function Calculadora() {
  const { usuario } = useAuth()

  const [form, setForm] = useState({
    ticker: '',
    moneda: 'EUR',
    precioEntrada: '',
    stopLoss: '',
    precioObjetivo: ''
  })

  // Tipo de cambio EUR/USD — el usuario lo actualiza a mano
  const [fxEurUsd, setFxEurUsd] = useState(1.15)

  // Saldo realizado — en producción vendría de Firestore
  const saldoRealizado = 1000
  const riesgo = saldoRealizado * 0.01

  const entrada = parseFloat(form.precioEntrada) || 0
  const stop = parseFloat(form.stopLoss) || 0
  const objetivo = parseFloat(form.precioObjetivo) || 0

  // Distancia en euros según divisa
  const distanciaEuros = entrada > stop && entrada > 0 ? (form.moneda === 'USD' ? (entrada - stop) / fxEurUsd : entrada - stop) : 0

  const numAcciones = distanciaEuros > 0 ? riesgo / distanciaEuros : 0

  const inversionEuros = form.moneda === 'USD' ? (numAcciones * entrada) / fxEurUsd : numAcciones * entrada

  const riesgoReal = numAcciones * distanciaEuros

  const ratioRB =
    objetivo > entrada && distanciaEuros > 0 ? (form.moneda === 'USD' ? (objetivo - entrada) / fxEurUsd : objetivo - entrada) / distanciaEuros : 0

  const beneficioPrevisto =
    objetivo > entrada ? (form.moneda === 'USD' ? ((objetivo - entrada) * numAcciones) / fxEurUsd : (objetivo - entrada) * numAcciones) : 0

  // Niveles de stop loss (1% al 10%)
  const niveles = [
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

  // Guarda la operación en Firestore
  const guardarOperacion = async () => {
    if (!form.ticker || !entrada || !stop) return

    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), {
      ticker: form.ticker.toUpperCase(),
      moneda: form.moneda,
      precioEntrada: entrada,
      stopLoss: stop,
      precioObjetivo: objetivo || null,
      numAcciones: parseFloat(numAcciones.toFixed(4)),
      inversion: parseFloat(inversionEuros.toFixed(2)),
      fxCompra: form.moneda === 'USD' ? fxEurUsd : 1,
      estado: 'ABIERTA',
      pnlVivo: 0,
      precioActual: null,
      fechaApertura: serverTimestamp()
    })

    // Limpia el formulario
    setForm({ ticker: '', moneda: 'EUR', precioEntrada: '', stopLoss: '', precioObjetivo: '' })
    alert(`Operación ${form.ticker.toUpperCase()} guardada`)
  }

  const fmt2 = n => n.toFixed(2)
  const fmt3 = n => n.toFixed(3)

  return (
    <div className='flex flex-col gap-6 py-4'>
      <h2 className='text-lg font-bold text-gray-200'>Calculadora de entrada</h2>

      {/* EUR/USD */}
      <div className='flex items-center gap-3'>
        <label className='text-gray-400 text-sm'>EUR/USD actual:</label>
        <input
          type='number'
          step='0.0001'
          value={fxEurUsd}
          onChange={e => setFxEurUsd(parseFloat(e.target.value) || 1)}
          className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-1.5 text-yellow-400 font-bold w-28 text-center'
        />
        <span className='text-gray-500 text-xs'>Actualiza este valor cada día</span>
      </div>

      {/* Formulario */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-4'>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Ticker</label>
          <input
            value={form.ticker}
            onChange={e => setForm({ ...form, ticker: e.target.value })}
            placeholder='AAPL, SLR.ES...'
            className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-cyan-400 font-medium focus:border-blue-500 outline-none'
          />
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Moneda</label>
          <select
            value={form.moneda}
            onChange={e => setForm({ ...form, moneda: e.target.value })}
            className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-yellow-400 font-medium focus:border-blue-500 outline-none'
          >
            <option value='EUR'>EUR</option>
            <option value='USD'>USD</option>
          </select>
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Precio entrada</label>
          <input
            type='number'
            step='0.001'
            value={form.precioEntrada}
            onChange={e => setForm({ ...form, precioEntrada: e.target.value })}
            className='bg-gray-800 border border-blue-700 rounded-lg px-3 py-2 text-blue-300 focus:border-blue-500 outline-none'
          />
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Stop loss (precio)</label>
          <input
            type='number'
            step='0.001'
            value={form.stopLoss}
            onChange={e => setForm({ ...form, stopLoss: e.target.value })}
            className='bg-gray-800 border border-red-800 rounded-lg px-3 py-2 text-red-400 focus:border-red-500 outline-none'
          />
        </div>

        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-xs'>Precio objetivo (opcional)</label>
          <input
            type='number'
            step='0.001'
            value={form.precioObjetivo}
            onChange={e => setForm({ ...form, precioObjetivo: e.target.value })}
            className='bg-gray-800 border border-green-800 rounded-lg px-3 py-2 text-green-400 focus:border-green-500 outline-none'
          />
        </div>
      </div>

      {/* Resultados calculados */}
      {entrada > 0 && stop > 0 && entrada > stop && (
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Nº acciones</p>
            <p className='text-cyan-400 text-2xl font-bold'>{fmt2(numAcciones)}</p>
            <p className='text-gray-500 text-xs mt-1'>Con decimales</p>
          </div>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Inversión total</p>
            <p className='text-white text-2xl font-bold'>{fmt2(inversionEuros)} €</p>
          </div>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-400 text-xs mb-1'>Riesgo real</p>
            <p className='text-red-400 text-2xl font-bold'>{fmt2(riesgoReal)} €</p>
          </div>
          {ratioRB > 0 && (
            <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
              <p className='text-gray-400 text-xs mb-1'>Ratio R/B</p>
              <p className='text-green-400 text-2xl font-bold'>1:{fmt2(ratioRB)}</p>
              <p className='text-gray-500 text-xs mt-1'>Beneficio: {fmt2(beneficioPrevisto)} €</p>
            </div>
          )}
        </div>
      )}

      {/* Botón guardar */}
      {entrada > 0 && stop > 0 && (
        <button
          onClick={guardarOperacion}
          className='bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors w-full sm:w-auto'
        >
          Guardar operación en histórico
        </button>
      )}

      {/* Tabla de niveles de stop loss */}
      {entrada > 0 && (
        <div>
          <h3 className='text-base font-bold text-gray-200 mb-3'>Niveles de stop loss — riesgo = {fmt2(riesgo)} €</h3>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left text-gray-400 p-3 font-medium'>% Stop</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Precio stop</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Distancia</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Nº acciones</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Inversión €</th>
                  <th className='text-right text-gray-400 p-3 font-medium'>Nivel</th>
                </tr>
              </thead>
              <tbody>
                {niveles.map(({ pct, label, color }) => {
                  const precioStop = entrada * (1 - pct)
                  const dist = entrada - precioStop
                  const distE = form.moneda === 'USD' ? dist / fxEurUsd : dist
                  const acciones = distE > 0 ? riesgo / distE : 0
                  const inv = form.moneda === 'USD' ? (acciones * entrada) / fxEurUsd : acciones * entrada

                  return (
                    <tr
                      key={pct}
                      className='border-b border-gray-800 last:border-0 hover:bg-gray-800/50'
                    >
                      <td className={`p-3 font-bold ${color}`}>{(pct * 100).toFixed(0)}%</td>
                      <td className={`p-3 text-right ${color}`}>{fmt3(precioStop)}</td>
                      <td className='p-3 text-right text-gray-300'>{fmt3(dist)}</td>
                      <td className={`p-3 text-right font-bold ${color}`}>{fmt2(acciones)}</td>
                      <td className='p-3 text-right text-gray-300'>{fmt2(inv)} €</td>
                      <td className={`p-3 text-right font-medium ${color}`}>{label}</td>
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
