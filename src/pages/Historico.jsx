import { useState, useEffect } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { useConfig } from '../hooks/useConfig'
import { COLECCIONES } from '../config/constants'

// ── Formulario para registrar una operación cerrada manualmente ──
function FormularioOperacion({ onGuardar, onCancelar }) {
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
      // P&L real del broker — no se recalcula
      pnlEuros: parseFloat(form.pnlEuros) || 0,
      fxCompra: parseFloat(form.fxCompra) || 1,
      notas: form.notas,
      estado: 'CERRADA',
      pnlVivo: 0,
      fechaRegistro: serverTimestamp()
    })
  }

  // Estilos reutilizables para inputs
  const inputBase = 'bg-gray-800 border rounded-lg px-3 py-2 outline-none w-full'
  const inputNeutral = `${inputBase} border-gray-700 text-gray-200 focus:border-blue-500`
  const inputAzul = `${inputBase} border-blue-700 text-blue-300 focus:border-blue-500`
  const inputRojo = `${inputBase} border-red-800 text-red-300 focus:border-red-500`
  const inputVerde = `${inputBase} border-green-800 text-green-300 focus:border-green-500`

  return (
    <div className='bg-gray-900 border border-blue-800 rounded-xl p-5 mb-6'>
      <h3 className='text-base font-bold text-blue-400 mb-4'>Registrar operación cerrada</h3>

      <div className='grid grid-cols-2 sm:grid-cols-3 gap-4'>
        {/* Ticker */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Ticker *</label>
          <input
            value={form.ticker}
            onChange={e => set('ticker', e.target.value)}
            placeholder='SLR.ES, PEP.US...'
            className={inputNeutral}
          />
        </div>

        {/* Moneda */}
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

        {/* FX Compra — solo visible si es USD */}
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

        {/* Fecha apertura */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Fecha apertura</label>
          <input
            type='date'
            value={form.fechaApertura}
            onChange={e => set('fechaApertura', e.target.value)}
            className={inputNeutral}
          />
        </div>

        {/* Fecha cierre */}
        <div className='flex flex-col gap-1'>
          <label className='text-gray-400 text-sm'>Fecha cierre</label>
          <input
            type='date'
            value={form.fechaCierre}
            onChange={e => set('fechaCierre', e.target.value)}
            className={inputNeutral}
          />
        </div>

        {/* Precio entrada */}
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

        {/* Precio cierre */}
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

        {/* Nº acciones */}
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

        {/* Inversión real */}
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

        {/* P&L real del broker — el más importante */}
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

        {/* Notas */}
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

      {/* Botones */}
      <div className='flex gap-3 mt-4'>
        <button
          onClick={handleGuardar}
          className='bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-xl transition-colors'
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

// ── Página principal del Histórico ──
export default function Historico() {
  const { usuario } = useAuth()
  const { config } = useConfig()
  const [operaciones, setOperaciones] = useState([])
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  // Escucha operaciones en tiempo real desde Firestore
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap => {
      const ops = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          // Ordena por fecha de apertura descendente
          const fa = a.fechaApertura || ''
          const fb = b.fechaApertura || ''
          return fb.localeCompare(fa)
        })
      setOperaciones(ops)
    })
    return unsub
  }, [usuario])

  // Guarda una operación nueva en Firestore
  const guardarOperacion = async datos => {
    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), datos)
    setMostrarFormulario(false)
  }

  // Actualiza precio actual y recalcula P&L vivo para operaciones abiertas
  const actualizarPrecio = async (op, nuevoPrecio) => {
    const precio = parseFloat(nuevoPrecio)
    if (!precio) return

    const pnlVivo =
      op.moneda === 'USD' ? ((precio - op.precioEntrada) * op.numAcciones) / (config.fxEurUsd || 1.15) : (precio - op.precioEntrada) * op.numAcciones

    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id), { precioActual: precio, pnlVivo: parseFloat(pnlVivo.toFixed(2)) })
  }

  // Cierra una operación abierta con el precio actual
  const cerrarOperacion = async op => {
    if (!op.precioActual) {
      alert('Introduce primero el precio actual')
      return
    }
    const pnlEuros =
      op.moneda === 'USD'
        ? ((op.precioActual - op.precioEntrada) * op.numAcciones) / (op.fxCompra || 1)
        : (op.precioActual - op.precioEntrada) * op.numAcciones

    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id), {
      estado: 'CERRADA',
      precioCierre: op.precioActual,
      pnlEuros: parseFloat(pnlEuros.toFixed(2)),
      pnlVivo: 0,
      fechaCierre: new Date().toISOString().split('T')[0]
    })
  }

  // Elimina una operación de Firestore
  const eliminarOperacion = async op => {
    if (!confirm(`¿Eliminar ${op.ticker}? Esta acción no se puede deshacer.`)) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id))
  }

  const fmt2 = n => (n || 0).toFixed(2)
  const cerradas = operaciones.filter(o => o.estado === 'CERRADA')
  const abiertas = operaciones.filter(o => o.estado === 'ABIERTA')

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <h2 className='text-lg font-bold text-gray-200'>Histórico de operaciones</h2>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className='bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-xl transition-colors text-sm'
        >
          {mostrarFormulario ? 'Cancelar' : '+ Registrar operación'}
        </button>
      </div>

      {/* ── Formulario de registro ── */}
      {mostrarFormulario && (
        <FormularioOperacion
          onGuardar={guardarOperacion}
          onCancelar={() => setMostrarFormulario(false)}
        />
      )}

      {/* ── Mensaje si no hay operaciones ── */}
      {operaciones.length === 0 && (
        <p className='text-gray-500 text-center py-12'>No hay operaciones registradas. Usa el botón de arriba para añadir la primera.</p>
      )}

      {/* ── Posiciones abiertas ── */}
      {abiertas.length > 0 && (
        <div>
          <h3 className='text-base font-bold text-blue-400 mb-3'>Posiciones abiertas ({abiertas.length})</h3>
          <div className='flex flex-col gap-3'>
            {abiertas.map(op => (
              <div
                key={op.id}
                className='bg-gray-900 border border-blue-900 rounded-xl p-4'
              >
                <div className='flex items-start justify-between gap-4 flex-wrap'>
                  {/* Info */}
                  <div className='flex flex-col gap-1'>
                    <div className='flex items-center gap-2'>
                      <span className='text-cyan-400 font-bold'>{op.ticker}</span>
                      <span className='text-gray-500 text-sm'>{op.moneda}</span>
                      <span className='bg-blue-900 text-blue-400 text-xs px-2 py-0.5 rounded-full'>ABIERTA</span>
                    </div>
                    <div className='flex gap-4 text-sm text-gray-400 flex-wrap'>
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

                  {/* P&L vivo */}
                  <div className='text-right'>
                    <p className={`text-2xl font-bold ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(op.pnlVivo || 0) >= 0 ? '+' : ''}
                      {fmt2(op.pnlVivo)} €
                    </p>
                    <p className='text-gray-500 text-sm'>Latente</p>
                  </div>
                </div>

                {/* Controles de precio actual */}
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
                    className='bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg transition-colors'
                  >
                    Cerrar operación
                  </button>
                  <button
                    onClick={() => eliminarOperacion(op)}
                    className='text-red-600 hover:text-red-400 text-sm px-2 py-1.5 transition-colors ml-auto'
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Operaciones cerradas ── */}
      {cerradas.length > 0 && (
        <div>
          <h3 className='text-base font-bold text-gray-400 mb-3'>Operaciones cerradas ({cerradas.length})</h3>
          <div className='flex flex-col gap-3'>
            {cerradas.map(op => (
              <div
                key={op.id}
                className='bg-gray-900 border border-gray-800 rounded-xl p-4 opacity-90'
              >
                <div className='flex items-start justify-between gap-4 flex-wrap'>
                  {/* Info */}
                  <div className='flex flex-col gap-1'>
                    <div className='flex items-center gap-2'>
                      <span className='text-cyan-400 font-bold'>{op.ticker}</span>
                      <span className='text-gray-500 text-sm'>{op.moneda}</span>
                      <span className='bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full'>CERRADA</span>
                      {op.fechaApertura && <span className='text-gray-600 text-xs'>{op.fechaApertura}</span>}
                    </div>
                    <div className='flex gap-4 text-sm text-gray-400 flex-wrap'>
                      <span>
                        Entrada: <span className='text-gray-200'>{op.precioEntrada?.toFixed(3)}</span>
                      </span>
                      <span>
                        Cierre: <span className='text-gray-200'>{op.precioCierre?.toFixed(3)}</span>
                      </span>
                      <span>
                        Acciones: <span className='text-gray-200'>{op.numAcciones?.toFixed(4)}</span>
                      </span>
                      <span>
                        Inversión: <span className='text-gray-200'>{fmt2(op.inversion)} €</span>
                      </span>
                      {op.notas && <span className='text-gray-600 italic'>{op.notas}</span>}
                    </div>
                  </div>

                  {/* P&L real */}
                  <div className='flex items-center gap-4'>
                    <div className='text-right'>
                      <p className={`text-2xl font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(op.pnlEuros || 0) >= 0 ? '+' : ''}
                        {fmt2(op.pnlEuros)} €
                      </p>
                      {op.inversion > 0 && (
                        <p className={`text-sm ${(op.pnlEuros || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%
                        </p>
                      )}
                    </div>
                    {/* Botón eliminar */}
                    <button
                      onClick={() => eliminarOperacion(op)}
                      className='text-red-800 hover:text-red-500 text-sm px-2 py-1 transition-colors'
                      title='Eliminar operación'
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
