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
// TRASPASOS:
//   Al registrar un traspaso se crean DOS documentos automáticamente:
//   - Uno con importe negativo en la cuenta origen
//   - Uno con importe positivo en la cuenta destino
//   Así el listado muestra los dos lados del movimiento con claridad.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES, CUENTAS, TIPO_MOVIMIENTO } from '../config/constants'

export function useMovimientos() {
  const { usuario } = useAuth()
  const [movimientos, setMovimientos] = useState([])

  // ── Escucha en tiempo real ─────────────────────────────────────────────────
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        // Ordenar por fecha de más antiguo a más reciente
        .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
      setMovimientos(data)
    })
    return unsub
  }, [usuario])

  // ── Saldos calculados ──────────────────────────────────────────────────────
  // Los movimientos legacy sin campo 'cuenta' se asumen como TRADING
  const saldos = useMemo(() => {
    let trading = 0
    let bunker = 0

    for (const m of movimientos) {
      const cuenta = m.cuenta || CUENTAS.TRADING
      const importe = m.importe || 0

      // Los traspasos ya vienen con el signo correcto (positivo en destino,
      // negativo en origen) gracias a cómo los guardamos en añadirTraspaso
      if (cuenta === CUENTAS.TRADING) {
        trading += importe
      } else if (cuenta === CUENTAS.BUNKER) {
        bunker += importe
      }
    }

    return {
      trading,
      bunker,
      // El total consolidado se usa en el Dashboard para calcular el saldo base
      total: trading + bunker
    }
  }, [movimientos])

  // ── Añadir movimiento simple ───────────────────────────────────────────────
  // Para: DEPOSITO, RETIRADA, INTERES, DIVIDENDO, AJUSTE, RETIRADA_BANCO
  const añadirMovimiento = async ({ fecha, tipo, importe, cuenta, notas }) => {
    // Determinar el signo real del importe según el tipo
    let importeReal = Math.abs(importe)

    if (tipo === TIPO_MOVIMIENTO.RETIRADA || tipo === TIPO_MOVIMIENTO.RETIRADA_BANCO) {
      // Salida de dinero → negativo
      importeReal = -importeReal
    }
    // El resto (DEPOSITO, INTERES, DIVIDENDO, AJUSTE) → positivo

    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), {
      fecha,
      tipo,
      importe: importeReal,
      // Si no se pasa cuenta, asumimos TRADING (compatibilidad legacy)
      cuenta: cuenta || CUENTAS.TRADING,
      notas: notas || '',
      fechaRegistro: serverTimestamp()
    })
  }

  // ── Añadir traspaso entre cuentas ──────────────────────────────────────────
  // Crea DOS documentos en una escritura atómica (batch):
  //   1. Salida (-importe) en la cuenta origen
  //   2. Entrada (+importe) en la cuenta destino
  // Así el historial muestra ambos lados y los saldos son siempre correctos.
  const añadirTraspaso = async ({ fecha, importe, tipo, notas }) => {
    const importeAbs = Math.abs(parseFloat(importe))
    if (!importeAbs || importeAbs <= 0) return

    // Determinar origen y destino según el tipo de traspaso
    const esHaciaTrading = tipo === TIPO_MOVIMIENTO.TRASPASO_A_TRADING
    const cuentaOrigen = esHaciaTrading ? CUENTAS.BUNKER : CUENTAS.TRADING
    const cuentaDestino = esHaciaTrading ? CUENTAS.TRADING : CUENTAS.BUNKER

    const ref = collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS)
    const batch = writeBatch(db)

    // Documento de salida (negativo en origen)
    batch.set(doc(ref), {
      fecha,
      tipo,
      importe: -importeAbs, // sale de la cuenta origen
      cuenta: cuentaOrigen,
      notas: notas || '',
      esParejaTraspaso: true, // marca para saber que tiene pareja
      fechaRegistro: serverTimestamp()
    })

    // Documento de entrada (positivo en destino)
    batch.set(doc(ref), {
      fecha,
      tipo,
      importe: +importeAbs, // entra en la cuenta destino
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

  // ── Compatibilidad: totalMovimientos para el Dashboard ────────────────────
  // El Dashboard usa este valor para calcular el saldo base (saldo realizado).
  // Ahora devolvemos solo el saldo TRADING porque el P&L de operaciones
  // pertenece a esa cuenta. El Bunker se muestra por separado.
  const totalMovimientos = saldos.trading

  return {
    movimientos,
    añadirMovimiento,
    añadirTraspaso,
    eliminarMovimiento,
    // Saldos individuales
    saldoTrading: saldos.trading,
    saldoBunker: saldos.bunker,
    saldoTotal: saldos.total,
    // Legacy: el Dashboard lo sigue usando con este nombre
    totalMovimientos
  }
}
