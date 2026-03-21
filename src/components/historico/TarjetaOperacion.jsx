// Tarjeta individual de operación — abierta o cerrada
import FormularioEdicion from './FormularioEdicion'
import { useModoPrivado } from '../../context/ModoPrivadoContext'

export default function TarjetaOperacion({
  op,
  editandoId,
  setEditandoId,
  onActualizarPrecio,
  onCerrar,
  onEliminar,
  onGuardarEdicion,
  fmtPnl // función fmt2 del padre
}) {
  const { ocultar } = useModoPrivado()
  const esCerrada = op.estado === 'CERRADA'
  const fmt2 = fmtPnl

  if (!esCerrada) {
    // ── Posición abierta ──
    return (
      <div className='bg-gray-900 border border-blue-900 rounded-xl p-4'>
        <div className='flex items-start justify-between gap-4 flex-wrap'>
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
          <div className='text-right'>
            <p className={`text-2xl font-bold ${(op.pnlVivo || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {ocultar(`${(op.pnlVivo || 0) >= 0 ? '+' : ''}${fmt2(op.pnlVivo)} €`)}
            </p>
            <p className='text-gray-500 text-sm'>Latente</p>
          </div>
        </div>
        <div className='flex items-center gap-3 mt-3 pt-3 border-t border-gray-800 flex-wrap'>
          <input
            type='number'
            step='0.001'
            placeholder='Precio actual'
            defaultValue={op.precioActual || ''}
            onBlur={e => onActualizarPrecio(op, e.target.value)}
            className='bg-gray-800 border border-yellow-700 rounded-lg px-3 py-1.5
                       text-yellow-400 text-sm w-36 outline-none'
          />
          <button
            onClick={() => onCerrar(op)}
            className='bg-green-700 hover:bg-green-600 text-white text-sm
                       px-4 py-1.5 rounded-lg transition-colors'
          >
            Cerrar operación
          </button>
          <button
            onClick={() => setEditandoId(editandoId === op.id ? null : op.id)}
            className='text-yellow-600 hover:text-yellow-400 text-sm px-2 py-1.5 transition-colors'
          >
            ✎ Editar
          </button>
          <button
            onClick={() => onEliminar(op)}
            className='text-red-600 hover:text-red-400 text-sm px-2 py-1.5
                       transition-colors ml-auto'
          >
            Eliminar
          </button>
        </div>
        {editandoId === op.id && (
          <FormularioEdicion
            operacion={op}
            onGuardar={datos => onGuardarEdicion(op.id, datos)}
            onCancelar={() => setEditandoId(null)}
          />
        )}
      </div>
    )
  }

  // ── Operación cerrada ──
  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl p-4 opacity-90'>
      <div className='flex items-start justify-between gap-4 flex-wrap'>
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
        <div className='flex items-center gap-4'>
          <div className='text-right'>
            <p className={`text-2xl font-bold ${(op.pnlEuros || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {ocultar(`${(op.pnlEuros || 0) >= 0 ? '+' : ''}${fmt2(op.pnlEuros)} €`)}
            </p>
            {op.inversion > 0 && (
              <p className={`text-sm ${(op.pnlEuros || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {ocultar(`${(((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)}%`)}
              </p>
            )}
          </div>
          <div className='flex flex-col gap-1 items-end'>
            <button
              onClick={() => setEditandoId(editandoId === op.id ? null : op.id)}
              className='text-yellow-600 hover:text-yellow-400 text-sm px-2 py-1 transition-colors'
            >
              ✎
            </button>
            <button
              onClick={() => onEliminar(op)}
              className='text-red-800 hover:text-red-500 text-sm px-2 py-1 transition-colors'
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      {editandoId === op.id && (
        <FormularioEdicion
          operacion={op}
          onGuardar={datos => onGuardarEdicion(op.id, datos)}
          onCancelar={() => setEditandoId(null)}
        />
      )}
    </div>
  )
}
