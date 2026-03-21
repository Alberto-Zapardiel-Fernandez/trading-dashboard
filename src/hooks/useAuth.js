import { useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from '../config/firebase'

export function useAuth() {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  // Escucha cambios de sesión
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setUsuario(user)
      setCargando(false)
    })
    return unsub
  }, [])

  // Login con Google
  const login = () => signInWithPopup(auth, googleProvider)

  // Cerrar sesión
  const logout = () => signOut(auth)

  return { usuario, cargando, login, logout }
}
