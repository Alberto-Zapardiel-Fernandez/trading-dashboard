// ─────────────────────────────────────────────────────────────────────────────
// Movimientos.jsx — Libro de caja multicuenta (Trading + Bunker)
//
// FLUJOS SOPORTADOS:
//   · Depósito/Retirada/Interés/Dividendo/Ajuste → a una cuenta específica
//   · Traspaso Bunker → Trading  (registra salida en Bunker + entrada en Trading)
//   · Traspaso Trading → Bunker  (registra salida en Trading + entrada en Bunker)
//   · Retirada al banco          (sale dinero real, a cualquier cuenta)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { useMovimientos } from '../hooks/useMovimientos'
import { TIPO_MOVIMIENTO, INFO_TIPO_MOVIMIENTO, CUENTAS, INFO_CUENTA } from '../config/constants'
import { exportarMovimientosCSV, exportarMovimientosExcel } from '../services/exportutils.js'
import { useModoPrivado } from '../context/ModoPrivadoContext'

// ── Tipos que se muestran en el selector del formulario ───────────────────────
// Los tipos de traspaso tienen UI especial, así que los separamos
const TIPOS_SIMPLES = [
  TIPO_MOVIMIENTO.DEPOSITO,
  TIPO_MOVIMIENTO.RETIRADA,
  TIPO_MOVIMIENTO.INTERES,
  TIPO_MOVIMIENTO.DIVIDENDO,
  TIPO_MOVIMIENTO.AJUSTE,
  TIPO_MOVIMIENTO.RETIRADA_BANCO
]

const TIPOS_TRASPASO = [TIPO_MOVIMIENTO.TRASPASO_A_TRADING, TIPO_MOVIMIENTO.TRASPASO_A_BUNKER]

// ── ¿El tipo necesita elegir cuenta? ─────────────────────────────────────────
// Los traspasos y la retirada al banco son entre cuentas, no son "de una cuenta"
const necesitaCuenta = tipo => TIPOS_SIMPLES.includes(tipo) && tipo !== TIPO_MOVIMIENTO.RETIRADA_BANCO

// ── ¿El tipo es un traspaso? ──────────────────────────────────────────────────
const esTraspaso = tipo => TIPOS_TRASPASO.includes(tipo)

// ── Componente: Tarjeta de resumen de cuenta ─────────────────────────────────
function TarjetaCuenta({ info, saldo, ocultar }) {
  return (
    <div className={`bg-gray-900 border ${info.borde} rounded-xl p-4`}>
      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${info.color}`}>{info.label}</p>
      <p className={`text-2xl font-bold ${saldo >= 0 ? info.color : 'text-red-400'}`}>{ocultar(`${saldo >= 0 ? '+' : ''}${saldo.toFixed(2)} €`)}</p>
    </div>
  )
}

// ── Componente: Fila de movimiento en la tabla ────────────────────────────────
function FilaMovimiento({ m, onEliminar, ocultar }) {
  const info = INFO_TIPO_MOVIMIENTO[m.tipo] || INFO_TIPO_MOVIMIENTO.AJUSTE
  const infoCuenta = INFO_CUENTA[m.cuenta || CUENTAS.TRADING]
  const signoStr = m.importe >= 0 ? '+' : ''

  return (
    <tr className='border-b border-gray-800 last:border-0 hover:bg-gray-800/40'>
      <td className='p-3 text-gray-400 text-sm whitespace-nowrap'>{m.fecha}</td>
      <td className='p-3'>
        {/* Etiqueta de cuenta */}
        <span className={`text-xs px-1.5 py-0.5 rounded ${infoCuenta.fondo} ${infoCuenta.color} mr-2`}>{infoCuenta.label}</span>
        {/* Tipo de movimiento */}
        <span className={`text-xs px-2 py-0.5 rounded-full ${info.fondo} ${info.texto}`}>{info.label}</span>
      </td>
      <td className={`p-3 text-right font-bold tabular-nums ${info.texto}`}>{ocultar(`${signoStr}${(m.importe || 0).toFixed(2)} €`)}</td>
      <td className='p-3 text-gray-500 text-sm'>{m.notas}</td>
      <td className='p-3 text-right'>
        <button
          onClick={() => onEliminar(m.id)}
          className='text-red-800 hover:text-red-500 transition-colors text-sm'
          title='Eliminar'
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

// ── Componente: Tarjeta de movimiento (móvil) ─────────────────────────────────
function TarjetaMovimiento({ m, onEliminar, ocultar }) {
  const info = INFO_TIPO_MOVIMIENTO[m.tipo] || INFO_TIPO_MOVIMIENTO.AJUSTE
  const infoCuenta = INFO_CUENTA[m.cuenta || CUENTAS.TRADING]
  const signoStr = m.importe >= 0 ? '+' : ''

  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3'>
      <div className='flex flex-col gap-1 flex-1 min-w-0'>
        <div className='flex items-center gap-2 flex-wrap'>
          {/* Cuenta */}
          <span className={`text-xs px-1.5 py-0.5 rounded ${infoCuenta.fondo} ${infoCuenta.color}`}>{infoCuenta.label}</span>
          {/* Tipo */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${info.fondo} ${info.texto}`}>{info.label}</span>
          <span className='text-gray-600 text-xs'>{m.fecha}</span>
        </div>
        {m.notas && <span className='text-gray-600 text-xs truncate'>{m.notas}</span>}
      </div>
      <div className='flex items-center gap-3 shrink-0'>
        <span className={`font-bold tabular-nums ${info.texto}`}>{ocultar(`${signoStr}${(m.importe || 0).toFixed(2)} €`)}</span>
        <button
          onClick={() => onEliminar(m.id)}
          className='text-red-800 hover:text-red-500 transition-colors'
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Movimientos() {
  const { movimientos, añadirMovimiento, añadirTraspaso, eliminarMovimiento, saldoTrading, saldoBunker, saldoTotal } = useMovimientos()

  const { ocultar } = useModoPrivado()

  // Estado del formulario
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    tipo: TIPO_MOVIMIENTO.DEPOSITO,
    cuenta: CUENTAS.BUNKER, // por defecto Bunker (donde entran las mensualidades)
    importe: '',
    notas: ''
  })

  // Filtro de cuenta para el listado (null = todas)
  const [filtroCuenta, setFiltroCuenta] = useState(null)

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // ── Guardar movimiento ─────────────────────────────────────────────────────
  const handleGuardar = async () => {
    const importe = parseFloat(form.importe)
    if (!importe || importe <= 0 || !form.fecha) return

    if (esTraspaso(form.tipo)) {
      // Traspaso: crea dos documentos automáticamente
      await añadirTraspaso({
        fecha: form.fecha,
        tipo: form.tipo,
        importe: importe,
        notas: form.notas
      })
    } else {
      // Movimiento simple: una sola entrada
      await añadirMovimiento({
        fecha: form.fecha,
        tipo: form.tipo,
        cuenta: necesitaCuenta(form.tipo) ? form.cuenta : null,
        importe: importe,
        notas: form.notas
      })
    }

    // Limpiar solo importe y notas; mantener fecha/tipo/cuenta para rapidez
    setForm(f => ({ ...f, importe: '', notas: '' }))
  }

  const handleEliminar = async id => {
    if (
      !confirm(
        '¿Eliminar este movimiento?\n\nSi es un traspaso, elimina solo este lado. Elimina también el movimiento opuesto si quieres corregirlo.'
      )
    )
      return
    await eliminarMovimiento(id)
  }

  // ── Movimientos filtrados para el listado ──────────────────────────────────
  const movimientosFiltrados = useMemo(() => {
    const lista = movimientos.slice().reverse() // más recientes primero
    if (!filtroCuenta) return lista
    return lista.filter(m => (m.cuenta || CUENTAS.TRADING) === filtroCuenta)
  }, [movimientos, filtroCuenta])

  // ── Cálculo de entradas/salidas del listado visible ────────────────────────
  const totalEntradas = movimientosFiltrados.filter(m => m.importe > 0).reduce((s, m) => s + m.importe, 0)
  const totalSalidas = movimientosFiltrados.filter(m => m.importe < 0).reduce((s, m) => s + m.importe, 0)

  // ── Colores del formulario según tipo ─────────────────────────────────────
  const esNegativo = form.tipo === TIPO_MOVIMIENTO.RETIRADA || form.tipo === TIPO_MOVIMIENTO.RETIRADA_BANCO
  const colorImporte = esNegativo
    ? 'border-red-700 text-red-300'
    : esTraspaso(form.tipo)
      ? 'border-amber-600 text-amber-300'
      : 'border-green-700 text-green-300'

  const inputBase = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 outline-none w-full text-gray-200 focus:border-blue-500'

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <div>
          <h2 className='text-lg font-bold text-gray-200'>Libro de caja</h2>
          <p className='text-gray-500 text-sm'>Gestión de capital: cuenta Trading y cuenta Bunker</p>
        </div>
        {movimientos.length > 0 && (
          <div className='flex items-center gap-2'>
            <button
              onClick={() => exportarMovimientosCSV(movimientosFiltrados)}
              className='border border-gray-600 hover:border-gray-400 text-gray-400
                         hover:text-gray-200 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
            >
              ↓ CSV
            </button>
            <button
              onClick={() => exportarMovimientosExcel(movimientosFiltrados)}
              className='border border-green-800 hover:border-green-600 text-green-600
                         hover:text-green-400 text-sm font-medium py-2 px-4 rounded-xl transition-colors'
            >
              ↓ Excel
            </button>
          </div>
        )}
      </div>

      {/* ── Resumen de saldos por cuenta ── */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <TarjetaCuenta
          info={INFO_CUENTA.TRADING}
          saldo={saldoTrading}
          ocultar={ocultar}
        />
        <TarjetaCuenta
          info={INFO_CUENTA.BUNKER}
          saldo={saldoBunker}
          ocultar={ocultar}
        />

        {/* Total consolidado */}
        <div className='bg-gray-900 border border-gray-700 rounded-xl p-4'>
          <p className='text-xs font-bold uppercase tracking-wider mb-1 text-gray-400'>Total consolidado</p>
          <p className={`text-2xl font-bold ${saldoTotal >= 0 ? 'text-white' : 'text-red-400'}`}>
            {ocultar(`${saldoTotal >= 0 ? '+' : ''}${saldoTotal.toFixed(2)} €`)}
          </p>
          <p className='text-gray-600 text-xs mt-1'>Trading + Bunker</p>
        </div>
      </div>

      {/* ── Formulario ── */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-5'>
        <h3 className='text-base font-bold text-gray-300 mb-4'>Registrar movimiento</h3>

        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'>
          {/* Fecha */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Fecha</label>
            <input
              type='date'
              value={form.fecha}
              onChange={e => set('fecha', e.target.value)}
              className={inputBase}
            />
          </div>

          {/* Tipo */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>Tipo</label>
            <select
              value={form.tipo}
              onChange={e => set('tipo', e.target.value)}
              className={inputBase}
            >
              {/* Movimientos simples */}
              <optgroup label='Movimientos'>
                {TIPOS_SIMPLES.map(t => (
                  <option
                    key={t}
                    value={t}
                  >
                    {INFO_TIPO_MOVIMIENTO[t].label}
                  </option>
                ))}
              </optgroup>
              {/* Traspasos entre cuentas */}
              <optgroup label='Traspasos entre cuentas'>
                {TIPOS_TRASPASO.map(t => (
                  <option
                    key={t}
                    value={t}
                  >
                    {INFO_TIPO_MOVIMIENTO[t].label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Cuenta — solo si el tipo no es un traspaso ni retirada al banco */}
          {necesitaCuenta(form.tipo) ? (
            <div className='flex flex-col gap-1'>
              <label className='text-gray-400 text-sm'>Cuenta</label>
              <select
                value={form.cuenta}
                onChange={e => set('cuenta', e.target.value)}
                className={inputBase}
              >
                <option value={CUENTAS.BUNKER}>Bunker</option>
                <option value={CUENTAS.TRADING}>Trading</option>
              </select>
            </div>
          ) : (
            // Placeholder para mantener la cuadrícula alineada
            <div className='flex flex-col gap-1'>
              <label className='text-gray-400 text-sm'>Cuenta</label>
              <div className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-600 text-sm'>
                {esTraspaso(form.tipo) ? 'Automático (dos entradas)' : 'Fuera de cuentas'}
              </div>
            </div>
          )}

          {/* Importe */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-sm'>
              Importe €{esNegativo && <span className='text-gray-600 text-xs ml-1'>(sale dinero)</span>}
              {esTraspaso(form.tipo) && <span className='text-gray-600 text-xs ml-1'>(a mover)</span>}
            </label>
            <input
              type='number'
              step='0.01'
              min='0'
              value={form.importe}
              onChange={e => set('importe', e.target.value)}
              placeholder='977.32'
              className={`bg-gray-800 border rounded-lg px-3 py-2 outline-none w-full focus:border-blue-500 ${colorImporte}`}
            />
          </div>

          {/* Notas */}
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

        {/* Aviso explicativo para traspasos */}
        {esTraspaso(form.tipo) && (
          <p className='text-amber-500/80 text-xs mt-3'>
            ℹ️ Un traspaso crea dos apuntes automáticamente: una salida en la cuenta origen y una entrada en la cuenta destino.
          </p>
        )}

        <button
          onClick={handleGuardar}
          className='mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium
                     py-2 px-6 rounded-xl transition-colors'
        >
          Guardar movimiento
        </button>
      </div>

      {/* ── Filtro de cuenta para el listado ── */}
      <div className='flex items-center gap-2 flex-wrap'>
        <span className='text-gray-500 text-sm'>Ver:</span>
        {[null, CUENTAS.TRADING, CUENTAS.BUNKER].map(c => (
          <button
            key={c ?? 'todas'}
            onClick={() => setFiltroCuenta(c)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              filtroCuenta === c ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {c === null ? 'Todas' : INFO_CUENTA[c].label}
          </button>
        ))}
        {/* Resumen rápido del filtro activo */}
        {movimientosFiltrados.length > 0 && (
          <span className='text-gray-700 text-xs ml-2'>
            {movimientosFiltrados.length} apuntes · <span className='text-green-600'>+{totalEntradas.toFixed(2)} €</span>{' '}
            <span className='text-red-600'>{totalSalidas.toFixed(2)} €</span>
          </span>
        )}
      </div>

      {/* ── Listado ── */}
      {movimientos.length === 0 ? (
        <p className='text-gray-500 text-center py-8'>No hay movimientos registrados. Empieza añadiendo el depósito inicial a Bunker.</p>
      ) : (
        <>
          {/* Móvil: tarjetas */}
          <div className='flex flex-col gap-2 md:hidden'>
            {movimientosFiltrados.map(m => (
              <TarjetaMovimiento
                key={m.id}
                m={m}
                onEliminar={handleEliminar}
                ocultar={ocultar}
              />
            ))}
          </div>

          {/* Escritorio: tabla */}
          <div className='hidden md:block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full'>
              <thead>
                <tr className='border-b border-gray-800'>
                  <th className='text-left text-gray-400 p-3 font-medium text-sm'>Fecha</th>
                  <th className='text-left text-gray-400 p-3 font-medium text-sm'>Tipo / Cuenta</th>
                  <th className='text-right text-gray-400 p-3 font-medium text-sm'>Importe</th>
                  <th className='text-left text-gray-400 p-3 font-medium text-sm'>Notas</th>
                  <th className='p-3'></th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map(m => (
                  <FilaMovimiento
                    key={m.id}
                    m={m}
                    onEliminar={handleEliminar}
                    ocultar={ocultar}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
