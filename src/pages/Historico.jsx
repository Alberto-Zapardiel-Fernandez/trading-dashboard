import { useState, useEffect } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { COLECCIONES } from '../config/constants'

export default function Historico() {
  const { usuario } = useAuth()
  const [operaciones, setOperaciones] = useState([])
  const [fxEurUsd, setFxEurUsd] = useState(1.15)

  // Escucha operaciones en tiempo real
  useEffect(() => {
    if (!usuario) return
    const q = collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES)
    const unsub = onSnapshot(q, snap => {
      const ops = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fechaApertura?.seconds || 0) - (a.fechaApertura?.seconds || 0))
      setOperaciones(ops)
    })
    return unsub
  }, [usuario])

  // Actualiza precio actual y recalcula P&L vivo
  const actualizarPrecio = async (op, nuevoPrecio) => {
    const precio = parseFloat(nuevoPrecio)
    if (!precio) return

    const pnlVivo = op.moneda === 'USD' ? ((precio - op.precioEntrada) * op.numAcciones) / fxEurUsd : (precio - op.precioEntrada) * op.numAcciones

    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id), { precioActual: precio, pnlVivo: parseFloat(pnlVivo.toFixed(2)) })
  }

  // Cierra la operación con el precio actual como precio de cierre
  const cerrarOperacion = async op => {
    if (!op.precioActual) {
      alert('Introduce primero el precio actual antes de cerrar')
      return
    }
    const pnlEuros =
      op.moneda === 'USD'
        ? ((op.precioActual - op.precioEntrada) * op.numAcciones) / (op.fxCompra || fxEurUsd)
        : (op.precioActual - op.precioEntrada) * op.numAcciones

    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id), {
      estado: 'CERRADA',
      precioCierre: op.precioActual,
      pnlEuros: parseFloat(pnlEuros.toFixed(2)),
      pnlVivo: 0,
      fechaCierre: new Date()
    })
  }

  // Elimina la operación
  const eliminarOperacion = async op => {
    if (!confirm(`¿Eliminar ${op.ticker}?`)) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id))
  }

  const fmt2 = n => (n || 0).toFixed(2)

  return (
    <div className='flex flex-col gap-6 py-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-bold text-gray-200'>Histórico de operaciones</h2>
        <div className='flex items-center gap-2'>
          <label className='text-gray-400 text-xs'>EUR/USD:</label>
          <input
            type='number'
            step='0.0001'
            value={fxEurUsd}
            onChange={e => setFxEurUsd(parseFloat(e.target.value) || 1)}
            className='bg-gray-800 border border-yellow-600 rounded px-2 py-1 text-yellow-400 w-24 text-center text-sm'
          />
        </div>
      </div>

      {operaciones.length === 0 ? (
        <p className='text-gray-500 text-center py-12'>No hay operaciones. Usa la Calculadora para añadir la primera.</p>
      ) : (
        <div className='flex flex-col gap-3'>
          {operaciones.map(op => (
            <div
              key={op.id}
              className={`bg-gray-900 border rounded-xl p-4 ${op.estado === 'CERRADA' ? 'border-gray-700 opacity-75' : 'border-gray-800'}`}
            >
              <div className='flex items-start justify-between gap-4 flex-wrap'>
                {/* Info principal */}
                <div className='flex flex-col gap-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-cyan-400 font-bold text-base'>{op.ticker}</span>
                    <span className='text-gray-500 text-xs'>{op.moneda}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        op.estado === 'CERRADA' ? 'bg-gray-700 text-gray-400' : 'bg-blue-900 text-blue-400'
                      }`}
                    >
                      {op.estado}
                    </span>
                  </div>
                  <div className='flex gap-4 text-xs text-gray-400 flex-wrap'>
                    <span>
                      Entrada: <span className='text-gray-200'>{op.precioEntrada?.toFixed(3)}</span>
                    </span>
                    <span>
                      Stop: <span className='text-red-400'>{op.stopLoss?.toFixed(3)}</span>
                    </span>
                    <span>
                      Acciones: <span className='text-gray-200'>{op.numAcciones?.toFixed(4)}</span>
                    </span>
                    <span>
                      Inversión: <span className='text-gray-200'>{fmt2(op.inversion)} €</span>
                    </span>
                  </div>
                </div>

                {/* P&L */}
                <div className='text-right'>
                  {op.estado === 'CERRADA' ? (
                    <div>
                      <p className={`text-xl font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(op.pnlEuros || 0) >= 0 ? '+' : ''}
                        {fmt2(op.pnlEuros)} €
                      </p>
                      <p className='text-gray-500 text-xs'>Cierre: {op.precioCierre?.toFixed(3)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className={`text-xl font-bold ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(op.pnlVivo || 0) >= 0 ? '+' : ''}
                        {fmt2(op.pnlVivo)} €
                      </p>
                      <p className='text-gray-500 text-xs'>Latente</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones — solo para operaciones abiertas */}
              {op.estado === 'ABIERTA' && (
                <div className='flex items-center gap-3 mt-3 pt-3 border-t border-gray-800 flex-wrap'>
                  <input
                    type='number'
                    step='0.001'
                    placeholder='Precio actual'
                    defaultValue={op.precioActual || ''}
                    onBlur={e => actualizarPrecio(op, e.target.value)}
                    className='bg-gray-800 border border-yellow-700 rounded-lg px-3 py-1.5 text-yellow-400 text-sm w-36 outline-none'
                  />
                  <button
                    onClick={() => cerrarOperacion(op)}
                    className='bg-green-700 hover:bg-green-600 text-white text-xs px-4 py-1.5 rounded-lg transition-colors'
                  >
                    Cerrar operación
                  </button>
                  <button
                    onClick={() => eliminarOperacion(op)}
                    className='text-red-500 hover:text-red-400 text-xs px-2 py-1.5 transition-colors'
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
