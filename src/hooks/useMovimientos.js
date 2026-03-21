import { useState, useEffect } from 'react'
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from './useAuth'
import { COLECCIONES } from '../config/constants'

export function useMovimientos() {
  const { usuario } = useAuth()
  const [movimientos, setMovimientos] = useState([])

  // Escucha movimientos en tiempo real
  useEffect(() => {
    if (!usuario) return
    const unsub = onSnapshot(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
      setMovimientos(data)
    })
    return unsub
  }, [usuario])

  // Añade un movimiento nuevo
  const añadirMovimiento = async movimiento => {
    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS), { ...movimiento, fechaRegistro: serverTimestamp() })
  }

  // Elimina un movimiento
  const eliminarMovimiento = async id => {
    await deleteDoc(doc(db, 'users', usuario.uid, COLECCIONES.MOVIMIENTOS, id))
  }

  // Suma total de todos los movimientos
  const totalMovimientos = movimientos.reduce((sum, m) => sum + (m.importe || 0), 0)

  return { movimientos, añadirMovimiento, eliminarMovimiento, totalMovimientos }
}
