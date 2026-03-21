import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../hooks/useAuth'
import { useConfig } from '../hooks/useConfig'
import { COLECCIONES } from '../config/constants'
import { exportarOperacionesCSV, exportarOperacionesExcel } from '../services/exportutils.js'
import FormularioOperacion from '../components/historico/FormularioOperacion'
import FiltrosHistorico from '../components/historico/FiltrosHistorico'
import TarjetaOperacion from '../components/historico/TarjetaOperacion'

export default function Historico() {
  const { usuario } = useAuth()
  const { config } = useConfig()

  const [operaciones, setOperaciones] = useState([])
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  // Filtros
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [filtroAnio, setFiltroAnio] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroResultado, setFiltroResultado] = useState('')

  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap => {
      const ops = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fechaApertura || '').localeCompare(a.fechaApertura || ''))
      setOperaciones(ops)
    })
    return unsub
  }, [usuario])

  const aniosDisponibles = useMemo(() => {
    const set = new Set()
    operaciones.forEach(op => {
      const fecha = op.fechaCierre || op.fechaApertura
      if (fecha) set.add(fecha.substring(0, 4))
    })
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [operaciones])

  const operacionesFiltradas = useMemo(() => {
    return operaciones.filter(op => {
      if (filtroBusqueda && !op.ticker?.toUpperCase().includes(filtroBusqueda.toUpperCase())) return false
      if (filtroAnio) {
        const fecha = op.fechaCierre || op.fechaApertura || ''
        if (!fecha.startsWith(filtroAnio)) return false
      }
      if (filtroEstado && op.estado !== filtroEstado) return false
      if (filtroResultado) {
        if (op.estado !== 'CERRADA') return false
        const esGanadora = (op.pnlEuros || 0) > 0
        if (filtroResultado === 'GANADORA' && !esGanadora) return false
        if (filtroResultado === 'PERDEDORA' && esGanadora) return false
      }
      return true
    })
  }, [operaciones, filtroBusqueda, filtroAnio, filtroEstado, filtroResultado])

  const guardarOperacion = async datos => {
    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), datos)
    setMostrarFormulario(false)
  }

  const guardarEdicion = async (id, datos) => {
    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, id), datos)
    setEditandoId(null)
  }

  const actualizarPrecio = async (op, nuevoPrecio) => {
    const precio = parseFloat(nuevoPrecio)
    if (!precio) return
    const pnlVivo =
      op.moneda === 'USD' ? ((precio - op.precioEntrada) * op.numAcciones) / (config.fxEurUsd || 1.15) : (precio - op.precioEntrada) * op.numAcciones
    await updateDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id), { precioActual: precio, pnlVivo: parseFloat(pnlVivo.toFixed(2)) })
  }

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

  const eliminarOperacion = async op => {
    if (!confirm(`¿Eliminar ${op.ticker}? Esta acción no se puede deshacer.`)) return
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.OPERACIONES, op.id))
  }

  const fmt2 = n => (n || 0).toFixed(2)
  const cerradas = operacionesFiltradas.filter(o => o.estado === 'CERRADA')
  const abiertas = operacionesFiltradas.filter(o => o.estado === 'ABIERTA')
  const hayFiltros = filtroBusqueda || filtroAnio || filtroEstado || filtroResultado

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <h2 className='text-lg font-bold text-gray-200'>Histórico de operaciones</h2>
        <div className='flex items-center gap-2 flex-wrap'>
          {operaciones.length > 0 && (
            <>
              <button
                onClick={() => exportarOperacionesCSV(operacionesFiltradas)}
                className='border border-gray-600 hover:border-gray-400 text-gray-400
                           hover:text-gray-200 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
                title={hayFiltros ? 'Exportar filtradas' : 'Exportar todas'}
              >
                ↓ CSV
              </button>
              <button
                onClick={() => exportarOperacionesExcel(operacionesFiltradas)}
                className='border border-green-800 hover:border-green-600 text-green-600
                           hover:text-green-400 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
                title={hayFiltros ? 'Exportar filtradas' : 'Exportar todas'}
              >
                ↓ Excel
              </button>
            </>
          )}
          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className='bg-blue-600 hover:bg-blue-700 text-white font-medium
                       py-2 px-5 rounded-xl transition-colors text-sm'
          >
            {mostrarFormulario ? 'Cancelar' : '+ Registrar operación'}
          </button>
        </div>
      </div>

      {mostrarFormulario && (
        <FormularioOperacion
          onGuardar={guardarOperacion}
          onCancelar={() => setMostrarFormulario(false)}
        />
      )}

      {/* ── Filtros ── */}
      {operaciones.length > 0 && (
        <FiltrosHistorico
          filtroBusqueda={filtroBusqueda}
          setFiltroBusqueda={setFiltroBusqueda}
          filtroAnio={filtroAnio}
          setFiltroAnio={setFiltroAnio}
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
          filtroResultado={filtroResultado}
          setFiltroResultado={setFiltroResultado}
          aniosDisponibles={aniosDisponibles}
          totalFiltradas={operacionesFiltradas.length}
          totalTotal={operaciones.length}
          onLimpiar={() => {
            setFiltroBusqueda('')
            setFiltroAnio('')
            setFiltroEstado('')
            setFiltroResultado('')
          }}
        />
      )}

      {operaciones.length === 0 && (
        <p className='text-gray-500 text-center py-12'>No hay operaciones registradas. Usa el botón de arriba para añadir la primera.</p>
      )}

      {operaciones.length > 0 && operacionesFiltradas.length === 0 && (
        <p className='text-gray-500 text-center py-8'>No hay operaciones que coincidan con los filtros aplicados.</p>
      )}

      {/* ── Posiciones abiertas ── */}
      {abiertas.length > 0 && (
        <div>
          <h3 className='text-base font-bold text-blue-400 mb-3'>Posiciones abiertas ({abiertas.length})</h3>
          <div className='flex flex-col gap-3'>
            {abiertas.map(op => (
              <TarjetaOperacion
                key={op.id}
                op={op}
                editandoId={editandoId}
                setEditandoId={setEditandoId}
                onActualizarPrecio={actualizarPrecio}
                onCerrar={cerrarOperacion}
                onEliminar={eliminarOperacion}
                onGuardarEdicion={guardarEdicion}
                fmtPnl={fmt2}
              />
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
              <TarjetaOperacion
                key={op.id}
                op={op}
                editandoId={editandoId}
                setEditandoId={setEditandoId}
                onActualizarPrecio={actualizarPrecio}
                onCerrar={cerrarOperacion}
                onEliminar={eliminarOperacion}
                onGuardarEdicion={guardarEdicion}
                fmtPnl={fmt2}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
