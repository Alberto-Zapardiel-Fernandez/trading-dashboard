// src/hooks/useInstalarPWA.js
// Hook personalizado para gestionar la instalación de la PWA.
//
// El navegador lanza el evento 'beforeinstallprompt' cuando detecta
// que la app cumple los criterios para instalarse (HTTPS, manifest, SW).
// Lo capturamos y lo guardamos para poder lanzarlo cuando el usuario pulse
// el botón de instalación, en lugar de mostrar el banner automático.

import { useState, useEffect } from 'react'

export function useInstalarPWA() {
  // Guardamos el evento para poder dispararlo manualmente más tarde
  const [promptEvento, setPromptEvento] = useState(null)

  // true si la app ya está instalada (o el usuario acaba de aceptar)
  const [instalada, setInstalada] = useState(false)

  useEffect(() => {
    // Capturamos el evento y cancelamos el banner automático del navegador
    const handleBeforeInstall = evento => {
      evento.preventDefault()
      setPromptEvento(evento)
    }

    // El navegador lanza este evento cuando el usuario finaliza la instalación
    const handleInstalada = () => {
      setInstalada(true)
      setPromptEvento(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalada)

    // Limpieza al desmontar el componente
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalada)
    }
  }, [])

  // Función que lanza el diálogo de instalación nativo del navegador
  const instalar = async () => {
    if (!promptEvento) return

    // Mostramos el diálogo nativo
    promptEvento.prompt()

    // Esperamos la decisión del usuario
    const { outcome } = await promptEvento.userChoice

    if (outcome === 'accepted') {
      setInstalada(true)
    }

    // El evento ya no se puede reusar tras usarlo
    setPromptEvento(null)
  }

  return {
    // true solo cuando el navegador ha ofrecido instalación y no está instalada
    puedeInstalar: !!promptEvento && !instalada,
    instalar,
    instalada
  }
}
