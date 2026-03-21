import { useState, useEffect } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES } from '../config/constants'
import { usePreciosVivos } from './../hooks/usePreciosVivos'

export default function DCA() {
  const { usuario } = useAuth()
  const [aportaciones, setAportaciones] = useState([])
  const [precioActual, setPrecioActual] = useState('')
  const [form, setForm] = useState({ fecha: '', invertido: '', precioCompra: '' })
  const [error, setError] = useState('')
  const { precios } = usePreciosVivos(['VUSA.DE'])

  useEffect(() => {
    if (precios['VUSA.DE']) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrecioActual(precios['VUSA.DE'].toString())
    }
  }, [precios])

  useEffect(() => {
    if (!usuario) return
    const q = collection(db, 'users', usuario.uid, COLECCIONES.DCA)
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
      setAportaciones(data)
    })
    return unsub
  }, [usuario])

  const totalInvertido = aportaciones.reduce((s, a) => s + (a.invertido || 0), 0)
  const totalParticipaciones = aportaciones.reduce((s, a) => s + (a.participaciones || 0), 0)
  const precioMedio = totalParticipaciones > 0 ? totalInvertido / totalParticipaciones : 0
  const valorActual = totalParticipaciones * (parseFloat(precioActual) || 0)
  const pnl = valorActual - totalInvertido
  const pnlPct = totalInvertido > 0 ? (pnl / totalInvertido) * 100 : 0

  const añadirAportacion = async () => {
    const invertido = parseFloat(form.invertido)
    const precioCompra = parseFloat(form.precioCompra)

    // Validación con mensaje visible
    if (!form.fecha) {
      setError('Selecciona una fecha')
      return
    }
    if (!invertido || invertido <= 0) {
      setError('Introduce el importe invertido')
      return
    }
    if (!precioCompra || precioCompra <= 0) {
      setError('Introduce el precio de compra')
      return
    }

    setError('')
    const participaciones = invertido / precioCompra

    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.DCA), {
      fecha: form.fecha,
      invertido: invertido,
      precioCompra: precioCompra,
      participaciones: parseFloat(participaciones.toFixed(6)),
      fechaRegistro: serverTimestamp()
    })
    setForm({ fecha: '', invertido: '', precioCompra: '' })
  }

  const eliminarAportacion = async id => {
    if (!confirm('¿Eliminar esta aportación?')) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.DCA, id))
  }

  const fmt2 = n => n.toFixed(2)
  const fmt3 = n => n.toFixed(3)

  return (
    <div className='flex flex-col gap-6 py-4'>
      <h2 className='text-lg font-bold text-gray-200'>DCA VUSA — Vanguard S&P 500 UCITS ETF</h2>

      {/* Precio actual */}
      <div className='flex items-center gap-3'>
        <label className='text-gray-400 text-sm'>Precio actual VUSA.DE:</label>
        <input
          type='number'
          step='0.001'
          value={precioActual}
          onChange={e => setPrecioActual(e.target.value)}
          placeholder='111.485'
          className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-1.5 text-yellow-400 font-bold w-32 text-center'
        />
        <span className='text-gray-500 text-xs'>Actualiza para ver el P&L</span>
      </div>

      {/* Resumen */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-xs mb-1'>Total invertido</p>
          <p className='text-yellow-400 text-xl font-bold'>{fmt2(totalInvertido)} €</p>
        </div>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-xs mb-1'>Participaciones</p>
          <p className='text-cyan-400 text-xl font-bold'>{totalParticipaciones.toFixed(4)}</p>
        </div>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-xs mb-1'>Precio medio (break-even)</p>
          <p className='text-purple-400 text-xl font-bold'>{fmt3(precioMedio)} €</p>
          <p className='text-gray-500 text-xs mt-1'>= invertido ÷ participaciones</p>
        </div>
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
          <p className='text-gray-400 text-xs mb-1'>P&L total</p>
          <p className={`text-xl font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}
            {fmt2(pnl)} €
          </p>
          <p className={`text-xs mt-1 ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {pnlPct >= 0 ? '+' : ''}
            {pnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Formulario nueva aportación */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
        <h3 className='text-sm font-bold text-gray-300 mb-3'>Registrar aportación</h3>
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Fecha</label>
            <input
              type='date'
              value={form.fecha}
              onChange={e => {
                setError('')
                setForm({ ...form, fecha: e.target.value })
              }}
              className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 outline-none'
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Invertido (€)</label>
            <input
              type='number'
              step='0.01'
              value={form.invertido}
              onChange={e => {
                setError('')
                setForm({ ...form, invertido: e.target.value })
              }}
              placeholder='99.29'
              className='bg-gray-800 border border-blue-700 rounded-lg px-3 py-2 text-blue-300 outline-none'
            />
          </div>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Precio de compra (€)</label>
            <input
              type='number'
              step='0.001'
              value={form.precioCompra}
              onChange={e => {
                setError('')
                setForm({ ...form, precioCompra: e.target.value })
              }}
              placeholder='111.485'
              className='bg-gray-800 border border-blue-700 rounded-lg px-3 py-2 text-blue-300 outline-none'
            />
          </div>
        </div>

        {/* Mensaje de error */}
        {error && <p className='text-red-400 text-xs mt-2'>⚠ {error}</p>}

        <button
          onClick={añadirAportacion}
          className='mt-3 bg-purple-700 hover:bg-purple-600 text-white font-medium py-2 px-5 rounded-lg transition-colors text-sm'
        >
          Añadir aportación
        </button>
      </div>

      {/* Tabla de aportaciones */}
      {aportaciones.length > 0 && (
        <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-gray-800'>
                <th className='text-left  text-gray-400 p-3 font-medium'>Fecha</th>
                <th className='text-right text-gray-400 p-3 font-medium'>Invertido</th>
                <th className='text-right text-gray-400 p-3 font-medium'>Precio compra</th>
                <th className='text-right text-gray-400 p-3 font-medium'>Participaciones</th>
                <th className='text-right text-gray-400 p-3 font-medium'>PM acumulado</th>
                <th className='text-right text-gray-400 p-3 font-medium'>Valor hoy</th>
                <th className='p-3'></th>
              </tr>
            </thead>
            <tbody>
              {aportaciones.map((a, i) => {
                const invAcum = aportaciones.slice(0, i + 1).reduce((s, x) => s + x.invertido, 0)
                const partAcum = aportaciones.slice(0, i + 1).reduce((s, x) => s + x.participaciones, 0)
                const pmAcum = partAcum > 0 ? invAcum / partAcum : 0
                const valorHoy = a.participaciones * (parseFloat(precioActual) || 0)

                return (
                  <tr
                    key={a.id}
                    className='border-b border-gray-800 last:border-0 hover:bg-gray-800/50'
                  >
                    <td className='p-3 text-gray-300'>{a.fecha.split('-').reverse().join('-')}</td>
                    <td className='p-3 text-right text-blue-300'>{fmt2(a.invertido)} €</td>
                    <td className='p-3 text-right text-gray-300'>{fmt3(a.precioCompra)} €</td>
                    <td className='p-3 text-right text-cyan-400'>{a.participaciones?.toFixed(4)}</td>
                    <td className='p-3 text-right text-purple-400'>{fmt3(pmAcum)} €</td>
                    <td className='p-3 text-right text-gray-300'>{precioActual ? `${fmt2(valorHoy)} €` : '—'}</td>
                    <td className='p-3 text-right'>
                      <button
                        onClick={() => eliminarAportacion(a.id)}
                        className='text-red-600 hover:text-red-400 text-xs transition-colors'
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
