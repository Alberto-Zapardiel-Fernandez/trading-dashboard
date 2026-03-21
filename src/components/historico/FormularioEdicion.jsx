// Formulario de edición prefilled — funciona para abiertas y cerradas
import { useState } from 'react'

const inputBase = 'bg-gray-800 border rounded-lg px-3 py-2 outline-none w-full'
const inputNeutral = `${inputBase} border-gray-700 text-gray-200 focus:border-blue-500`
const inputAzul = `${inputBase} border-blue-700 text-blue-300 focus:border-blue-500`
const inputRojo = `${inputBase} border-red-800 text-red-300 focus:border-red-500`
const inputVerde = `${inputBase} border-green-800 text-green-300 focus:border-green-500`

export default function FormularioEdicion({ operacion, onGuardar, onCancelar }) {
  const [form, setForm] = useState({
    ticker: operacion.ticker ?? '',
    moneda: operacion.moneda ?? 'EUR',
    fechaApertura: operacion.fechaApertura ?? '',
    fechaCierre: operacion.fechaCierre ?? '',
    precioEntrada: operacion.precioEntrada ?? '',
    precioCierre: operacion.precioCierre ?? '',
    stopLoss: operacion.stopLoss ?? '',
    numAcciones: operacion.numAcciones ?? '',
    inversion: operacion.inversion ?? '',
    pnlEuros: operacion.pnlEuros ?? '',
    fxCompra: operacion.fxCompra ?? '1',
    notas: operacion.notas ?? ''
  })
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))
  const esCerrada = operacion.estado === 'CERRADA'

  const handleGuardar = () => {
    if (!form.ticker || !form.precioEntrada) {
      alert('Ticker y precio de entrada son obligatorios')
      return
    }
    const datos = {
      ticker: form.ticker.toUpperCase(),
      moneda: form.moneda,
      fechaApertura: form.fechaApertura || null,
      precioEntrada: parseFloat(form.precioEntrada) || 0,
      numAcciones: parseFloat(form.numAcciones) || 0,
      inversion: parseFloat(form.inversion) || 0,
      fxCompra: parseFloat(form.fxCompra) || 1,
      notas: form.notas
    }
    if (esCerrada) {
      datos.fechaCierre = form.fechaCierre || null
      datos.precioCierre = parseFloat(form.precioCierre) || 0
      datos.pnlEuros = parseFloat(form.pnlEuros) || 0
    } else {
      datos.stopLoss = parseFloat(form.stopLoss) || null
    }
    onGuardar(datos)
  }

  return (
    <div className='bg-gray-900 border border-yellow-800 rounded-xl p-5 mt-3'>
      <h3 className='text-base font-bold text-yellow-400 mb-4'>
        Editando {operacion.ticker}
        <span className='text-gray-500 font-normal text-sm ml-2'>— {esCerrada ? 'operación cerrada' : 'posición abierta'}</span>
      </h3>
      <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Ticker</label>
          <input
            value={form.ticker}
            onChange={e => set('ticker', e.target.value)}
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
        {esCerrada && (
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Fecha cierre</label>
            <input
              type='date'
              value={form.fechaCierre}
              onChange={e => set('fechaCierre', e.target.value)}
              className={inputNeutral}
            />
          </div>
        )}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Precio entrada</label>
          <input
            type='number'
            step='0.001'
            value={form.precioEntrada}
            onChange={e => set('precioEntrada', e.target.value)}
            className={inputAzul}
          />
        </div>
        {esCerrada && (
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Precio cierre</label>
            <input
              type='number'
              step='0.001'
              value={form.precioCierre}
              onChange={e => set('precioCierre', e.target.value)}
              className={inputAzul}
            />
          </div>
        )}
        {!esCerrada && (
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Stop Loss</label>
            <input
              type='number'
              step='0.001'
              value={form.stopLoss}
              onChange={e => set('stopLoss', e.target.value)}
              className={inputRojo}
            />
          </div>
        )}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Nº acciones</label>
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
        {esCerrada && (
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm font-medium'>P&L real € (broker)</label>
            <input
              type='number'
              step='0.01'
              value={form.pnlEuros}
              onChange={e => set('pnlEuros', e.target.value)}
              className={parseFloat(form.pnlEuros) >= 0 ? inputVerde : inputRojo}
            />
          </div>
        )}
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
          className='bg-yellow-600 hover:bg-yellow-500 text-black font-bold
                     py-2 px-6 rounded-xl transition-colors'
        >
          Guardar cambios
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
