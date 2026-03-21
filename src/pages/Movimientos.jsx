import { useState } from 'react'
import { useMovimientos } from '../hooks/useMovimientos'
import { TIPO_MOVIMIENTO } from '../config/constants'
import { exportarMovimientosCSV, exportarMovimientosExcel } from '../services/exportutils.js'
import { useModoPrivado } from '../context/ModoPrivadoContext'

const COLORES = {
  DEPOSITO: { texto: 'text-green-400', fondo: 'bg-green-900/30', label: 'Depósito' },
  RETIRADA: { texto: 'text-red-400', fondo: 'bg-red-900/30', label: 'Retirada' },
  INTERES: { texto: 'text-blue-400', fondo: 'bg-blue-900/30', label: 'Interés' },
  DIVIDENDO: { texto: 'text-purple-400', fondo: 'bg-purple-900/30', label: 'Dividendo' },
  AJUSTE: { texto: 'text-yellow-400', fondo: 'bg-yellow-900/30', label: 'Ajuste' }
}

export default function Movimientos() {
  const { movimientos, añadirMovimiento, eliminarMovimiento, totalMovimientos } = useMovimientos()
  const { ocultar } = useModoPrivado()

  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'DEPOSITO',
    importe: '',
    notas: ''
  })

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  const handleGuardar = async () => {
    const importe = parseFloat(form.importe)
    if (!importe || !form.fecha) return
    const importeReal = form.tipo === 'RETIRADA' ? -Math.abs(importe) : Math.abs(importe)
    await añadirMovimiento({ fecha: form.fecha, tipo: form.tipo, importe: importeReal, notas: form.notas })
    setForm(f => ({ ...f, importe: '', notas: '' }))
  }

  const handleEliminar = async id => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await eliminarMovimiento(id)
  }

  const inputBase = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 outline-none w-full text-gray-200 focus:border-blue-500'

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <h2 className='text-lg font-bold text-gray-200'>Libro de caja</h2>
        {movimientos.length > 0 && (
          <div className='flex items-center gap-2'>
            <button
              onClick={() => exportarMovimientosCSV(movimientos)}
              className='border border-gray-600 hover:border-gray-400 text-gray-400
                         hover:text-gray-200 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
            >
              ↓ CSV
            </button>
            <button
              onClick={() => exportarMovimientosExcel(movimientos)}
              className='border border-green-800 hover:border-green-600 text-green-600
                         hover:text-green-400 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
            >
              ↓ Excel
            </button>
          </div>
        )}
      </div>

      {/* ── Resumen ── */}
      <div className='grid grid-cols-3 gap-3'>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-sm mb-1'>Total entradas</p>
          <p className='text-green-400 text-2xl font-bold'>
            {ocultar(
              `+${movimientos
                .filter(m => m.importe > 0)
                .reduce((s, m) => s + m.importe, 0)
                .toFixed(2)} €`
            )}
          </p>
        </div>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-sm mb-1'>Total salidas</p>
          <p className='text-red-400 text-2xl font-bold'>
            {ocultar(
              `${movimientos
                .filter(m => m.importe < 0)
                .reduce((s, m) => s + m.importe, 0)
                .toFixed(2)} €`
            )}
          </p>
        </div>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-sm mb-1'>Balance neto</p>
          <p className={`text-2xl font-bold ${totalMovimientos >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {ocultar(`${totalMovimientos >= 0 ? '+' : ''}${totalMovimientos.toFixed(2)} €`)}
          </p>
        </div>
      </div>

      {/* ── Formulario ── */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-5'>
        <h3 className='text-base font-bold text-gray-300 mb-4'>Registrar movimiento</h3>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Fecha</label>
            <input
              type='date'
              value={form.fecha}
              onChange={e => set('fecha', e.target.value)}
              className={inputBase}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Tipo</label>
            <select
              value={form.tipo}
              onChange={e => set('tipo', e.target.value)}
              className={inputBase}
            >
              {Object.entries(COLORES).map(([key, val]) => (
                <option
                  key={key}
                  value={key}
                >
                  {val.label}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Importe € {form.tipo === 'RETIRADA' && '(se guarda negativo)'}</label>
            <input
              type='number'
              step='0.01'
              value={form.importe}
              onChange={e => set('importe', e.target.value)}
              placeholder='977.32'
              className={`bg-gray-800 border rounded-lg px-3 py-2 outline-none w-full ${
                form.tipo === 'RETIRADA' ? 'border-red-700 text-red-300' : 'border-green-700 text-green-300'
              }`}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Notas</label>
            <input
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder='Descripción...'
              className={inputBase}
            />
          </div>
        </div>
        <button
          onClick={handleGuardar}
          className='mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium
                     py-2 px-6 rounded-xl transition-colors'
        >
          Guardar movimiento
        </button>
      </div>

      {/* ── Listado ── */}
      {movimientos.length === 0 ? (
        <p className='text-gray-500 text-center py-8'>No hay movimientos registrados. Empieza añadiendo el depósito inicial.</p>
      ) : (
        <>
          {/* Móvil: tarjetas */}
          <div className='flex flex-col gap-2 md:hidden'>
            {movimientos
              .slice()
              .reverse()
              .map(m => {
                const estilo = COLORES[m.tipo] || COLORES.AJUSTE
                return (
                  <div
                    key={m.id}
                    className='bg-gray-900 border border-gray-800 rounded-xl px-4 py-3
                             flex items-center justify-between gap-3'
                  >
                    <div className='flex flex-col gap-1 flex-1 min-w-0'>
                      <div className='flex items-center gap-2'>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full
                                        ${estilo.fondo} ${estilo.texto}`}
                        >
                          {estilo.label}
                        </span>
                        <span className='text-gray-500 text-xs'>{m.fecha}</span>
                      </div>
                      {m.notas && <span className='text-gray-600 text-xs truncate'>{m.notas}</span>}
                    </div>
                    <div className='flex items-center gap-3 shrink-0'>
                      <span className={`font-bold ${estilo.texto}`}>{ocultar(`${m.importe >= 0 ? '+' : ''}${m.importe.toFixed(2)} €`)}</span>
                      <button
                        onClick={() => handleEliminar(m.id)}
                        className='text-red-800 hover:text-red-500 transition-colors'
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Escritorio: tabla */}
          <div
            className='hidden md:block bg-gray-900 border border-gray-800
                          rounded-xl overflow-hidden'
          >
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left  text-gray-400 p-4 font-medium'>Fecha</th>
                  <th className='text-left  text-gray-400 p-4 font-medium'>Tipo</th>
                  <th className='text-right text-gray-400 p-4 font-medium'>Importe</th>
                  <th className='text-left  text-gray-400 p-4 font-medium'>Notas</th>
                  <th className='p-4'></th>
                </tr>
              </thead>
              <tbody>
                {movimientos
                  .slice()
                  .reverse()
                  .map(m => {
                    const estilo = COLORES[m.tipo] || COLORES.AJUSTE
                    return (
                      <tr
                        key={m.id}
                        className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'
                      >
                        <td className='p-4 text-gray-300'>{m.fecha}</td>
                        <td className='p-4'>
                          <span
                            className={`text-xs px-2 py-1 rounded-full
                                          ${estilo.fondo} ${estilo.texto}`}
                          >
                            {estilo.label}
                          </span>
                        </td>
                        <td className={`p-4 text-right font-bold ${estilo.texto}`}>
                          {ocultar(`${m.importe >= 0 ? '+' : ''}${m.importe.toFixed(2)} €`)}
                        </td>
                        <td className='p-4 text-gray-500 text-sm'>{m.notas}</td>
                        <td className='p-4 text-right'>
                          <button
                            onClick={() => handleEliminar(m.id)}
                            className='text-red-800 hover:text-red-500 transition-colors'
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
