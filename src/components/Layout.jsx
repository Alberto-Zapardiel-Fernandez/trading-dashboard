import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, ChevronDown, Menu, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

// Estructura de navegación con submenús
const NAV = [
  {
    label: 'Dashboard',
    to: '/',
    exact: true
  },
  {
    label: 'Operaciones',
    hijos: [
      { to: '/calculadora', label: 'Calculadora de entrada' },
      { to: '/historico', label: 'Histórico' }
    ]
  },
  {
    label: 'Inversión',
    hijos: [{ to: '/dca', label: 'DCA VUSA' }]
  }
]

export default function Layout({ children, usuario }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  // Controla qué menú desplegable está abierto
  const [menuAbierto, setMenuAbierto] = useState(null)
  // Controla el menú móvil
  const [movil, setMovil] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const toggleMenu = label => {
    setMenuAbierto(menuAbierto === label ? null : label)
  }

  return (
    <div className='min-h-screen flex flex-col text-base'>
      {/* ── Barra de navegación principal ── */}
      <header className='bg-gray-900 border-b border-gray-800 sticky top-0 z-50'>
        <div className='max-w-7xl mx-auto px-4 h-14 flex items-center justify-between'>
          {/* Logo */}
          <span className='text-yellow-400 font-bold text-lg tracking-tight'>⚡ Trading Dashboard</span>

          {/* Navegación escritorio */}
          <nav className='hidden md:flex items-center gap-1'>
            {NAV.map(item =>
              item.to ? (
                // Enlace directo sin hijos
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  onClick={() => setMenuAbierto(null)}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ) : (
                // Menú con desplegable
                <div
                  key={item.label}
                  className='relative'
                >
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      menuAbierto === item.label ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${menuAbierto === item.label ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Desplegable */}
                  {menuAbierto === item.label && (
                    <div className='absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-48 z-50'>
                      {item.hijos.map(hijo => (
                        <NavLink
                          key={hijo.to}
                          to={hijo.to}
                          onClick={() => setMenuAbierto(null)}
                          className={({ isActive }) =>
                            `block px-4 py-2.5 text-sm transition-colors ${
                              isActive ? 'text-blue-400 bg-blue-600/10' : 'text-gray-300 hover:text-gray-100 hover:bg-gray-800'
                            }`
                          }
                        >
                          {hijo.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </nav>

          {/* Usuario + logout */}
          <div className='flex items-center gap-3'>
            <img
              src={usuario.photoURL}
              alt='avatar'
              className='w-8 h-8 rounded-full ring-2 ring-gray-700'
            />
            <span className='text-gray-300 text-sm hidden lg:block'>{usuario.displayName}</span>
            <button
              onClick={handleLogout}
              title='Cerrar sesión'
              className='text-gray-500 hover:text-red-400 transition-colors p-1'
            >
              <LogOut size={16} />
            </button>

            {/* Botón menú móvil */}
            <button
              onClick={() => setMovil(!movil)}
              className='md:hidden text-gray-400 hover:text-gray-100 p-1'
            >
              {movil ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── Menú móvil desplegado ── */}
        {movil && (
          <div className='md:hidden border-t border-gray-800 bg-gray-900 px-4 py-3 flex flex-col gap-1'>
            {NAV.map(item =>
              item.to ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  onClick={() => setMovil(false)}
                  className={({ isActive }) =>
                    `px-4 py-2.5 rounded-lg text-sm font-medium ${isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400'}`
                  }
                >
                  {item.label}
                </NavLink>
              ) : (
                <div key={item.label}>
                  <p className='px-4 py-1.5 text-xs text-gray-600 uppercase tracking-wider font-medium'>{item.label}</p>
                  {item.hijos.map(hijo => (
                    <NavLink
                      key={hijo.to}
                      to={hijo.to}
                      onClick={() => setMovil(false)}
                      className={({ isActive }) => `block px-6 py-2.5 rounded-lg text-sm ${isActive ? 'text-blue-400' : 'text-gray-400'}`}
                    >
                      {hijo.label}
                    </NavLink>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </header>

      {/* ── Contenido de cada página ── */}
      <main className='flex-1 max-w-7xl mx-auto w-full px-4 py-6'>{children}</main>
    </div>
  )
}
