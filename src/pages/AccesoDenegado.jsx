// src/pages/AccesoDenegado.jsx
// Pantalla que ve un usuario que ha hecho login con Google pero cuyo
// email no está en la whitelist de Firestore.
//
// Muestra su email para que pueda comunicarlo al administrador,
// y ofrece un botón para cerrar sesión y volver al login.

import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function AccesoDenegado() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className='min-h-screen flex items-center justify-center px-4'>
      <div className='bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center'>
        {/* Icono */}
        <div className='text-5xl mb-4'>🔒</div>

        {/* Título */}
        <h1 className='text-xl font-semibold text-gray-100 mb-2'>Acceso no autorizado</h1>

        {/* Descripción */}
        <p className='text-gray-400 text-sm mb-6'>
          Tu cuenta no tiene permiso para acceder a esta aplicación. Contacta con el administrador para solicitar acceso.
        </p>

        {/* Email del usuario — útil para que lo comunique al admin */}
        {usuario?.email && (
          <div className='bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-6'>
            <p className='text-xs text-gray-500 mb-1'>Cuenta utilizada</p>
            <p className='text-sm text-gray-300 font-mono'>{usuario.email}</p>
          </div>
        )}

        {/* Botón cerrar sesión */}
        <button
          onClick={handleLogout}
          className='w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors'
        >
          Cerrar sesión y volver al inicio
        </button>
      </div>
    </div>
  )
}
