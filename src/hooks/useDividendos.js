// ─────────────────────────────────────────────────────────────────────────────
// useDividendos.js — Hook para gestionar dividendos de la Cartera Bunker
//
// MODELO DE DATOS en Firestore (users/{uid}/dividendos/{id}):
//   fecha           string    'YYYY-MM-DD' — fecha de cobro del dividendo
//   ticker          string    Símbolo Yahoo Finance, ej: 'VUAA.DE'
//   nombre          string    Nombre corto, ej: 'VUAA'
//   importe         number    Euros cobrados en total
//   participaciones number    Participaciones que se tenían al cobrar (para calcular €/acción)
//   notas           string    Opcional
//   movimientoId    string    ID del movimiento vinculado en la colección movimientos/
//                             Guardamos este ID para poder borrarlo en cascada
//   fechaRegistro   timestamp
//
// INTEGRACIÓN AUTOMÁTICA CON LIBRO DE CAJA:
//   Al registrar un dividendo se crea simultáneamente (en un batch atómico)
//   un movimiento de tipo DIVIDENDO en la cuenta BUNKER dentro de movimientos/.
//   Así el libro de caja siempre está sincronizado sin trabajo manual.
//   Al eliminar el dividendo se elimina también su movimiento vinculado.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES, CUENTAS, TIPO_MOVIMIENTO } from '../config/constants'

export function useDividendos() {
  const { usuario } = useAuth()
  const [dividendos, setDividendos] = useState([])

  // ── Escucha en tiempo real la colección dividendos/ ───────────────────────
  useEffect(() => {
    if (!usuario) return
    const ref = collection(db, 'users', usuario.uid, COLECCIONES.DIVIDENDOS)
    const unsub = onSnapshot(ref, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        // Ordenar por fecha descendente (más reciente primero)
        .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
      setDividendos(data)
    })
    return unsub
  }, [usuario])

  // ── Añadir dividendo + movimiento vinculado (operación atómica) ───────────
  //
  // Usamos writeBatch para garantizar que ambas escrituras ocurren juntas.
  // Si falla una, falla todo — nunca quedará un dividendo sin movimiento
  // ni un movimiento sin dividendo.
  //
  // Parámetros:
  //   { fecha, ticker, nombre, importe, participaciones, notas }
  const añadirDividendo = async ({ fecha, ticker, nombre, importe, participaciones, notas }) => {
    const importeNum = Math.abs(parseFloat(importe))
    if (!importeNum || importeNum <= 0) return

    const batch = writeBatch(db)

    // Referencia al documento de dividendo (ID generado por Firestore)
    const refDividendos = collection(db, 'users', usuario.uid, COLECCIONES.DIVIDENDOS)
    const docDividendo = doc(refDividendos) // doc sin ID → Firestore genera uno

    // Referencia al documento de movimiento vinculado
    const refMovimientos = collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS)
    const docMovimiento = doc(refMovimientos)

    // 1. Documento en dividendos/ — guardamos el ID del movimiento para borrado en cascada
    batch.set(docDividendo, {
      fecha,
      ticker,
      nombre: nombre || ticker,
      importe: importeNum,
      participaciones: parseFloat(participaciones) || 0,
      notas: notas || '',
      movimientoId: docMovimiento.id, // enlace al movimiento vinculado
      fechaRegistro: serverTimestamp()
    })

    // 2. Documento en movimientos/ — aparece en el Libro de caja como DIVIDENDO en BUNKER
    //    La nota incluye el ticker para que sea identificable en el libro de caja
    batch.set(docMovimiento, {
      fecha,
      tipo: TIPO_MOVIMIENTO.DIVIDENDO,
      importe: importeNum, // positivo — entra en la cuenta
      cuenta: CUENTAS.BUNKER, // siempre en la cuenta Bunker
      notas: notas ? `${ticker} — ${notas}` : `Dividendo ${nombre || ticker}`,
      esDividendoBunker: true, // marca para identificarlo fácilmente en Movimientos.jsx
      tickerOrigen: ticker, // ticker que generó el dividendo
      dividendoId: docDividendo.id, // enlace inverso al dividendo
      fechaRegistro: serverTimestamp()
    })

    await batch.commit()
  }

  // ── Eliminar dividendo + su movimiento vinculado (borrado en cascada) ──────
  //
  // Buscamos el movimientoId guardado en el dividendo y borramos ambos
  // en un batch. Si el movimiento ya no existe (borrado manualmente), solo
  // se borra el dividendo — no lanza error.
  const eliminarDividendo = async dividendo => {
    const batch = writeBatch(db)

    // Borrar el dividendo
    const docDiv = doc(db, 'users', usuario.uid, COLECCIONES.DIVIDENDOS, dividendo.id)
    batch.delete(docDiv)

    // Borrar el movimiento vinculado (si existe el ID guardado)
    if (dividendo.movimientoId) {
      const docMov = doc(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS, dividendo.movimientoId)
      batch.delete(docMov)
    }

    await batch.commit()
  }

  // ── Resumen de dividendos agrupado por ticker ─────────────────────────────
  //
  // Devuelve un objeto { 'VUAA.DE': { total, cobros, nombre }, ... }
  // Usado en DCA.jsx para mostrar el yield en cada tarjeta de ticker
  const resumenPorTicker = useMemo(() => {
    const mapa = {}
    for (const d of dividendos) {
      if (!mapa[d.ticker]) {
        mapa[d.ticker] = { total: 0, cobros: 0, nombre: d.nombre || d.ticker }
      }
      mapa[d.ticker].total += d.importe || 0
      mapa[d.ticker].cobros += 1
    }
    return mapa
  }, [dividendos])

  // ── Total global de dividendos cobrados ───────────────────────────────────
  // Útil para el Dashboard y el resumen global de DCA.jsx
  const totalDividendos = useMemo(() => dividendos.reduce((s, d) => s + (d.importe || 0), 0), [dividendos])

  return {
    dividendos, // array completo ordenado por fecha desc
    añadirDividendo,
    eliminarDividendo,
    resumenPorTicker, // { ticker: { total, cobros, nombre } }
    totalDividendos // número — suma total de todos los dividendos
  }
}
