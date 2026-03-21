// Formulario para registrar una operación cerrada nueva
import { useState } from 'react'
import { serverTimestamp } from 'firebase/firestore'

const inputBase = 'bg-gray-800 border rounded-lg px-3 py-2 outline-none w-full'
const inputNeutral = `${inputBase} border-gray-700 text-gray-200 focus:border-blue-500`
const inputAzul = `${inputBase} border-blue-700 text-blue-300 focus:border-blue-500`
const inputRojo = `${inputBase} border-red-800 text-red-300 focus:border-red-500`
const inputVerde = `${inputBase} border-green-800 text-green-300 focus:border-green-500`

export default function FormularioOperacion({ onGuardar, onCancelar }) {
  const [form, setForm] = useState({
    ticker: '',
    moneda: 'EUR',
    fechaApertura: '',
    fechaCierre: '',
    precioEntrada: '',
    precioCierre: '',
    numAcciones: '',
    inversion: '',
    pnlEuros: '',
    fxCompra: '1',
    notas: ''
  })
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const handleGuardar = () => {
    if (!form.ticker || !form.precioEntrada || !form.precioCierre) {
      alert('Ticker, precio entrada y precio cierre son obligatorios')
      return
    }
    onGuardar({
      ticker: form.ticker.toUpperCase(),
      moneda: form.moneda,
      fechaApertura: form.fechaApertura || null,
      fechaCierre: form.fechaCierre || null,
      precioEntrada: parseFloat(form.precioEntrada),
      precioCierre: parseFloat(form.precioCierre),
      numAcciones: parseFloat(form.numAcciones) || 0,
      inversion: parseFloat(form.inversion) || 0,
      pnlEuros: parseFloat(form.pnlEuros) || 0,
      fxCompra: parseFloat(form.fxCompra) || 1,
      notas: form.notas,
      estado: 'CERRADA',
      pnlVivo: 0,
      fechaRegistro: serverTimestamp()
    })
  }

  return (
    <div className='bg-gray-900 border border-blue-800 rounded-xl p-5 mb-6'>
      <h3 className='text-base font-bold text-blue-400 mb-4'>Registrar operación cerrada</h3>
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Ticker *</label>
          <input
            value={form.ticker}
            onChange={e => set('ticker', e.target.value)}
            placeholder='SLR.ES, PEP.US...'
            className={inputNeutral}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Moneda</label>
          <select
            value={form.moneda}
            onChange={e => set('moneda', e.target.value)}
            className={inputNeutral}
          >
            <option value='EUR'>EUR</option>
            <option value='USD'>USD</option>
          </select>
        </div>
        {form.moneda === 'USD' && (
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>EUR/USD día compra</label>
            <input
              type='number'
              step='0.0001'
              value={form.fxCompra}
              onChange={e => set('fxCompra', e.target.value)}
              className={inputNeutral}
            />
          </div>
        )}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Fecha apertura</label>
          <input
            type='date'
            value={form.fechaApertura}
            onChange={e => set('fechaApertura', e.target.value)}
            className={inputNeutral}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Fecha cierre</label>
          <input
            type='date'
            value={form.fechaCierre}
            onChange={e => set('fechaCierre', e.target.value)}
            className={inputNeutral}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Precio entrada *</label>
          <input
            type='number'
            step='0.001'
            value={form.precioEntrada}
            onChange={e => set('precioEntrada', e.target.value)}
            className={inputAzul}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Precio cierre *</label>
          <input
            type='number'
            step='0.001'
            value={form.precioCierre}
            onChange={e => set('precioCierre', e.target.value)}
            className={inputAzul}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Nº acciones (broker)</label>
          <input
            type='number'
            step='0.0001'
            value={form.numAcciones}
            onChange={e => set('numAcciones', e.target.value)}
            className={inputNeutral}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Inversión real € (broker)</label>
          <input
            type='number'
            step='0.01'
            value={form.inversion}
            onChange={e => set('inversion', e.target.value)}
            className={inputNeutral}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm font-medium'>P&L real € (broker) *</label>
          <input
            type='number'
            step='0.01'
            value={form.pnlEuros}
            onChange={e => set('pnlEuros', e.target.value)}
            placeholder='-9.60 ó +9.04'
            className={parseFloat(form.pnlEuros) >= 0 ? inputVerde : inputRojo}
          />
        </div>
        <div className='flex flex-col gap-1 sm:col-span-2'>
          <label className='text-gray-400 text-sm'>Notas</label>
          <input
            value={form.notas}
            onChange={e => set('notas', e.target.value)}
            placeholder='Estrategia, motivo de entrada...'
            className={inputNeutral}
          />
        </div>
      </div>
      <div className='flex gap-3 mt-4'>
        <button
          onClick={handleGuardar}
          className='bg-blue-600 hover:bg-blue-700 text-white font-medium
                     py-2 px-6 rounded-xl transition-colors'
        >
          Guardar operación
        </button>
        <button
          onClick={onCancelar}
          className='text-gray-400 hover:text-gray-200 py-2 px-4 transition-colors'
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
