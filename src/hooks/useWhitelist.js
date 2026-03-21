// src/hooks/useWhitelist.js
// Hook que comprueba si el usuario autenticado tiene acceso a la app.
//
// Cuando un usuario es denegado, envía automáticamente un mensaje a
// Telegram del administrador con el email del solicitante y los pasos
// exactos para añadirlo a la whitelist.
//
// Estados posibles de 'acceso':
//   null      → todavía comprobando (mostrar spinner)
//   true      → usuario autorizado
//   false     → usuario no autorizado

import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

const TELEGRAM_TOKEN = import.meta.env.VITE_TELEGRAM_TOKEN
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID

// Link directo a la colección whitelist en la consola de Firebase
const LINK_FIRESTORE = 'https://console.firebase.google.com/project/trading-dashboard-478e9/firestore/data/~2Fwhitelist'

// ── Notificación Telegram al administrador ────────────────────────────────────

async function notificarAdminTelegram(email) {
  // Si no hay token o chat ID configurado, no hacemos nada
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.warn('[Whitelist] Telegram no configurado — no se puede notificar al admin')
    return
  }

  // Mensaje con instrucciones completas y link directo a Firestore
  const mensaje = [
    `🔐 *Solicitud de acceso — Trading Dashboard*`,
    ``,
    `El usuario *${email}* ha intentado acceder y no está en la lista blanca.`,
    ``,
    `*Pasos para darle acceso:*`,
    `1️⃣ Entra en Firestore:`,
    `${LINK_FIRESTORE}`,
    ``,
    `2️⃣ Haz clic en *+ Agregar documento*`,
    ``,
    `3️⃣ Rellena los campos:`,
    `• ID del documento: \`${email}\``,
    `• Campo: \`activo\``,
    `• Tipo: \`boolean\``,
    `• Valor: \`true\``,
    ``,
    `4️⃣ Guarda — el usuario podrá entrar en el siguiente intento de login.`
  ].join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: mensaje,
        parse_mode: 'Markdown'
      })
    })
  } catch (err) {
    console.error('[Whitelist] Error enviando notificación Telegram:', err)
  }
}

// ── Hook principal ────────────────────────────────────────────────────────────

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
          // Notificamos al administrador por Telegram con instrucciones
          await notificarAdminTelegram(usuario.email)
        }
      } catch (error) {
        // Si hay error de red o permisos, denegamos por seguridad
        console.error('[Whitelist] Error comprobando acceso:', error)
        setAcceso(false)
        // Intentamos notificar igualmente — quizás el error es solo de permisos
        await notificarAdminTelegram(usuario.email)
      }
    }

    comprobarAcceso()
  }, [usuario])

  return { acceso }
}
