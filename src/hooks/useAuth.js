// src/hooks/useAuth.js
// Hook de autenticación con Google.
// Al detectar sesión activa, crea o actualiza el documento users/{uid}
// en Firestore para que el script de GitHub Actions pueda encontrar al usuario.

import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, googleProvider, db } from '../config/firebase'

export function useAuth() {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      setUsuario(user)
      setCargando(false)

      if (user) {
        // Creamos o actualizamos el documento users/{uid}.
        // merge:true asegura que no borramos subcolecciones ni datos existentes.
        // Este documento es necesario para que el script de alertas de
        // GitHub Actions pueda iterar sobre todos los usuarios registrados.
        try {
          await setDoc(
            doc(db, 'users', user.uid),
            {
              email: user.displayName,
              ultimoAcceso: new Date().toISOString()
            },
            { merge: true }
          )
        } catch (err) {
          // No bloqueamos el login si esto falla — es secundario
          console.error('[useAuth] Error actualizando documento de usuario:', err)
        }
      }
    })
    return unsub
  }, [])

  const login = () => signInWithPopup(auth, googleProvider)
  const logout = () => signOut(auth)

  return { usuario, cargando, login, logout }
}
