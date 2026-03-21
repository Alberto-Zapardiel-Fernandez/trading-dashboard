// src/components/BotonInstalarPWA.jsx
// Botón que aparece en la navbar cuando el navegador detecta que la app
// puede instalarse como PWA. Se oculta automáticamente si:
//   - Ya está instalada
//   - El navegador no soporta PWA (Safari iOS antiguo, etc.)
//   - El usuario ya rechazó la instalación previamente

import { Download } from 'lucide-react'
import { useInstalarPWA } from '../hooks/useInstalarPWA'

export default function BotonInstalarPWA() {
  const { puedeInstalar, instalar } = useInstalarPWA()

  // Si no se puede instalar, no renderizamos nada
  if (!puedeInstalar) return null

  return (
    <button
      onClick={instalar}
      title='Instalar Trading Dashboard como app'
      className='
        flex items-center gap-1.5
        px-3 py-1.5 rounded-md
        text-sm font-medium
        text-blue-400 hover:text-blue-300
        border border-blue-800 hover:border-blue-600
        bg-blue-950/30 hover:bg-blue-950/50
        transition-all duration-200
      '
    >
      <Download size={15} />
      {/* En móvil solo el icono, en escritorio también el texto */}
      <span className='hidden sm:inline'>Instalar app</span>
    </button>
  )
}
