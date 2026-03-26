// ─────────────────────────────────────────────────────────────────────────────
// Layout.jsx — Estructura principal: navbar + contenido
//
// MENÚ DESPLEGABLE — solución definitiva:
//   · Se abre con onMouseEnter en el contenedor (hover)
//   · Se cierra con onMouseLeave en el contenedor (hover)
//   · Al hacer CLICK en un hijo, cierra el menú forzosamente (setMenuAbierto(null))
//     además de navegar — esto resuelve el problema de que el ratón se quede
//     quieto y el panel permanezca visible tras la navegación
//   · Un único estado 'menuAbierto' en el padre garantiza que solo
//     un menú esté abierto a la vez (sin solapamientos al mover rápido)
//   · En móvil: click, sin hover (no aplica en táctil)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LogOut, ChevronDown, Menu, X, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useModoPrivado } from '../context/ModoPrivadoContext'
import BotonInstalarPWA from './BotonInstalarPWA'

const NAV = [
  { label: 'Dashboard', to: '/', exact: true },
  {
    label: 'Operaciones',
    hijos: [
      { to: '/calculadora', label: 'Calculadora de entrada' },
      { to: '/historico', label: 'Histórico' },
      { to: '/resumen-fiscal', label: 'Resumen fiscal' },
      { to: '/estadisticas', label: 'Estadísticas' }
    ]
  },
  {
    label: 'Análisis',
    hijos: [
      { to: '/grafica', label: 'Análisis técnico' },
      { to: '/radar', label: 'Radar de vigilancia' },
      { to: '/explorador', label: 'Explorador' }
    ]
  },
  {
    label: 'Inversión',
    hijos: [
      { to: '/dca', label: 'Cartera Bunker' },
      { to: '/movimientos', label: 'Libro de caja' }
    ]
  },
  { label: 'Noticias', to: '/noticias', exact: false },
  { label: 'Configuración', to: '/configuracion', exact: false }
]

// ── Componente: menú desplegable de escritorio ────────────────────────────────
// Recibe el estado del padre para garantizar un único menú abierto a la vez.
// onCerrar se llama tanto en mouseLeave como al hacer click en un hijo.
function MenuDesplegable({ item, abierto, onAbrir, onCerrar }) {
  return (
    <div
      className='relative'
      onMouseEnter={onAbrir}
      onMouseLeave={onCerrar}
    >
      {/* Botón padre */}
      <button
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium
                    transition-colors whitespace-nowrap ${
                      abierto ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                    }`}
      >
        {item.label}
        <ChevronDown
          size={13}
          className={`transition-transform duration-150 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Panel desplegable — visible solo cuando abierto === true */}
      {abierto && (
        <div className='absolute top-full left-0 pt-1 z-50'>
          <div className='bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-52'>
            {item.hijos.map(hijo => (
              <NavLink
                key={hijo.to}
                to={hijo.to}
                // Al hacer click: cerrar el menú además de navegar
                onClick={onCerrar}
                className={({ isActive }) =>
                  `block px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
                    isActive ? 'text-blue-400 bg-blue-600/10' : 'text-gray-300 hover:text-gray-100 hover:bg-gray-800'
                  }`
                }
              >
                {hijo.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Layout({ children, usuario }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { modoPrivado, toggleModoPrivado } = useModoPrivado()

  // Un único estado para el menú abierto — null = ninguno
  const [menuAbierto, setMenuAbierto] = useState(null)
  const [movil, setMovil] = useState(false)

  // Cerrar todo al navegar (click en enlace o botón atrás del navegador)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuAbierto(null)
    setMovil(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className='min-h-screen flex flex-col text-base'>
      <header className='bg-gray-900 border-b border-gray-800 sticky top-0 z-50'>
        <div className='max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2'>
          {/* Logo */}
          <NavLink
            to='/'
            className='text-yellow-400 font-bold tracking-tight whitespace-nowrap shrink-0
                       hover:text-yellow-300 transition-colors'
          >
            <span className='hidden lg:inline text-base'>⚡ Trading Dashboard</span>
            <span className='lg:hidden text-lg'>⚡</span>
          </NavLink>

          {/* ── Navegación escritorio ── */}
          <nav className='hidden md:flex items-center gap-0.5 flex-1 justify-center'>
            {NAV.map(item =>
              item.to ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ) : (
                <MenuDesplegable
                  key={item.label}
                  item={item}
                  abierto={menuAbierto === item.label}
                  onAbrir={() => setMenuAbierto(item.label)}
                  onCerrar={() => setMenuAbierto(null)}
                />
              )
            )}
          </nav>

          {/* ── Controles de usuario ── */}
          <div className='flex items-center gap-2 shrink-0'>
            <img
              src={usuario.photoURL}
              alt='avatar'
              className='w-7 h-7 rounded-full ring-2 ring-gray-700'
            />
            <span className='text-gray-300 text-sm hidden xl:block truncate max-w-32'>{usuario.displayName}</span>

            <BotonInstalarPWA />

            <button
              onClick={toggleModoPrivado}
              title={modoPrivado ? 'Modo privado activo — pulsa para mostrar valores' : 'Pulsa para ocultar valores'}
              className={`p-1 transition-colors ${modoPrivado ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {modoPrivado ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>

            <button
              onClick={handleLogout}
              title='Cerrar sesión'
              className='text-gray-500 hover:text-red-400 transition-colors p-1'
            >
              <LogOut size={15} />
            </button>

            <div className='md:hidden w-px h-5 bg-gray-700 mx-1' />
            <button
              onClick={() => setMovil(!movil)}
              className='md:hidden text-gray-400 hover:text-gray-100 p-2'
            >
              {movil ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── Menú móvil ── */}
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

      <main className='flex-1 max-w-7xl mx-auto w-full px-4 py-6'>{children}</main>
    </div>
  )
}
