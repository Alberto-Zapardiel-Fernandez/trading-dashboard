// ─────────────────────────────────────────────────────────────────────────────
// useMovimientos.js — Hook para el libro de caja multicuenta
//
// MODELO DE DATOS en Firestore (users/{uid}/movimientos/{id}):
//   fecha        string   'YYYY-MM-DD'
//   tipo         string   TIPO_MOVIMIENTO.*
//   importe      number   Siempre positivo; el signo lo decide el tipo
//   cuenta       string   'TRADING' | 'BUNKER'  (legacy sin campo → TRADING)
//   notas        string   opcional
//   fechaRegistro timestamp
//
// SALDO TRADING REAL:
//   El saldo real de la cuenta Trading es la suma de:
//     · Los movimientos del libro de caja (depósitos, retiradas...)
//     · El P&L realizado de las operaciones cerradas
//   Ambas fuentes se combinan aquí para que todas las páginas usen
//   el mismo valor correcto. El Dashboard ya lo hacía bien sumándolos;
//   ahora lo centralizamos en este hook.
//
// TRASPASOS:
//   Al registrar un traspaso se crean DOS documentos automáticamente:
//   - Uno con importe negativo en la cuenta origen
//   - Uno con importe positivo en la cuenta destino
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES, CUENTAS, TIPO_MOVIMIENTO } from '../config/constants'

export function useMovimientos() {
  const { usuario } = useAuth()
  const [movimientos, setMovimientos] = useState([])
  const [operaciones, setOperaciones] = useState([])

  // ── Escucha movimientos del libro de caja ──────────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
      setMovimientos(data)
    })
    return unsub
  }, [usuario])

  // ── Escucha operaciones para sumar el P&L realizado ───────────────────────
  // El saldo real de Trading = movimientos + P&L de operaciones cerradas.
  // Sin esto, cerrar una operación con pérdida no se refleja en el saldo
  // que usan la Calculadora, Estadísticas, etc.
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), snap => {
      setOperaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [usuario])

  // ── Saldos calculados ──────────────────────────────────────────────────────
  const saldos = useMemo(() => {
    let trading = 0
    let bunker = 0

    for (const m of movimientos) {
      const cuenta = m.cuenta || CUENTAS.TRADING
      const importe = m.importe || 0
      if (cuenta === CUENTAS.TRADING) trading += importe
      else if (cuenta === CUENTAS.BUNKER) bunker += importe
    }

    return { trading, bunker, total: trading + bunker }
  }, [movimientos])

  // ── P&L realizado de operaciones cerradas ─────────────────────────────────
  // Solo operaciones CERRADAS — las abiertas son P&L latente, no realizado
  const pnlRealizado = useMemo(() => operaciones.filter(o => o.estado === 'CERRADA').reduce((s, o) => s + (o.pnlEuros || 0), 0), [operaciones])

  // ── Saldo Trading REAL ────────────────────────────────────────────────────
  // Este es el valor que deben usar TODAS las páginas para calcular
  // el capital disponible en la cuenta Trading.
  // = depósitos/retiradas del libro de caja + P&L de operaciones cerradas
  const saldoTradingReal = saldos.trading + pnlRealizado

  // ── Compatibilidad con el nombre legacy ───────────────────────────────────
  // El Dashboard y otras páginas usan 'totalMovimientos'. Ahora devolvemos
  // el saldo real completo para que todos los sitios cuadren.
  const totalMovimientos = saldoTradingReal

  // ── Añadir movimiento simple ───────────────────────────────────────────────
  const añadirMovimiento = async ({ fecha, tipo, importe, cuenta, notas }) => {
    let importeReal = Math.abs(importe)
    if (tipo === TIPO_MOVIMIENTO.RETIRADA || tipo === TIPO_MOVIMIENTO.RETIRADA_BANCO) {
      importeReal = -importeReal
    }
    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), {
      fecha,
      tipo,
      importe: importeReal,
      cuenta: cuenta || CUENTAS.TRADING,
      notas: notas || '',
      fechaRegistro: serverTimestamp()
    })
  }

  // ── Añadir traspaso entre cuentas ──────────────────────────────────────────
  const añadirTraspaso = async ({ fecha, importe, tipo, notas }) => {
    const importeAbs = Math.abs(parseFloat(importe))
    if (!importeAbs || importeAbs <= 0) return

    const esHaciaTrading = tipo === TIPO_MOVIMIENTO.TRASPASO_A_TRADING
    const cuentaOrigen = esHaciaTrading ? CUENTAS.BUNKER : CUENTAS.TRADING
    const cuentaDestino = esHaciaTrading ? CUENTAS.TRADING : CUENTAS.BUNKER

    const ref = collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS)
    const batch = writeBatch(db)

    batch.set(doc(ref), {
      fecha,
      tipo,
      importe: -importeAbs,
      cuenta: cuentaOrigen,
      notas: notas || '',
      esParejaTraspaso: true,
      fechaRegistro: serverTimestamp()
    })

    batch.set(doc(ref), {
      fecha,
      tipo,
      importe: +importeAbs,
      cuenta: cuentaDestino,
      notas: notas || '',
      esParejaTraspaso: true,
      fechaRegistro: serverTimestamp()
    })

    await batch.commit()
  }

  // ── Eliminar movimiento ────────────────────────────────────────────────────
  const eliminarMovimiento = async id => {
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS, id))
  }

  return {
    movimientos,
    añadirMovimiento,
    añadirTraspaso,
    eliminarMovimiento,
    // Saldos individuales
    saldoTrading: saldoTradingReal, // Trading = libro de caja + P&L cerradas
    saldoBunker: saldos.bunker,
    saldoTotal: saldoTradingReal + saldos.bunker,
    // Legacy — mismo valor, usado en Dashboard, Calculadora, etc.
    totalMovimientos
  }
}
