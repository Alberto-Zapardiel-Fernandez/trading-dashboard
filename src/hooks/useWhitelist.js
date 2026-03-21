// src/hooks/useWhitelist.js
// Hook que comprueba si el usuario autenticado tiene acceso a la app.
//
// Consulta la colección 'whitelist' en Firestore buscando un documento
// cuyo ID sea el email del usuario. Si existe y tiene activo:true, se
// le permite el acceso. En cualquier otro caso se le deniega.
//
// Estados posibles de 'acceso':
//   null      → todavía comprobando (mostrar spinner)
//   true      → usuario autorizado
//   false     → usuario no autorizado

import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

export function useWhitelist(usuario) {
  // null = cargando, true = autorizado, false = denegado
  const [acceso, setAcceso] = useState(null)

  useEffect(() => {
    // Si no hay usuario autenticado, no hay nada que comprobar
    if (!usuario) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAcceso(null)
      return
    }

    const comprobarAcceso = async () => {
      try {
        // El ID del documento en whitelist es el email del usuario
        const ref = doc(db, 'whitelist', usuario.email)
        const snap = await getDoc(ref)

        if (snap.exists() && snap.data().activo === true) {
          // Email encontrado y activo — acceso concedido
          setAcceso(true)
        } else {
          // No existe o activo:false — acceso denegado
          setAcceso(false)
        }
      } catch (error) {
        // Si hay error de red o de permisos, denegamos por seguridad
        console.error('Error comprobando whitelist:', error)
        setAcceso(false)
      }
    }

    comprobarAcceso()
  }, [usuario]) // Se re-ejecuta si cambia el usuario (login/logout)

  return { acceso }
}
