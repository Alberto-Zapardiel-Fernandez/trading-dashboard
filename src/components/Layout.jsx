import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
// ── NUEVO: Eye y EyeOff para el toggle de modo privado ──
import { LogOut, ChevronDown, Menu, X, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
// ── NUEVO: hook del modo privado ──
import { useModoPrivado } from '../context/ModoPrivadoContext'
// ── NUEVO PWA: botón de instalación de la app ──
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
      { to: '/dca', label: 'DCA VUSA' },
      { to: '/movimientos', label: 'Libro de caja' }
    ]
  },
  { label: 'Noticias', to: '/noticias', exact: false },
  { label: 'Configuración', to: '/configuracion', exact: false }
]

export default function Layout({ children, usuario }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navRef = useRef(null)
  // ── NUEVO: estado y toggle del modo privado ──
  const { modoPrivado, toggleModoPrivado } = useModoPrivado()

  const [menuAbierto, setMenuAbierto] = useState(null)
  const [movil, setMovil] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuAbierto(null)
    setMovil(false)
  }, [location.pathname])

  useEffect(() => {
    const handler = e => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setMenuAbierto(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const toggleMenu = label => setMenuAbierto(menuAbierto === label ? null : label)

  return (
    <div className='min-h-screen flex flex-col text-base'>
      <header className='bg-gray-900 border-b border-gray-800 sticky top-0 z-50'>
        <div className='max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2'>
          {/* Logo */}
          <span className='text-yellow-400 font-bold tracking-tight whitespace-nowrap shrink-0'>
            <span className='hidden lg:inline text-base'>⚡ Trading Dashboard</span>
            <span className='lg:hidden text-lg'>⚡</span>
          </span>

          {/* Navegación escritorio */}
          <nav
            ref={navRef}
            className='hidden md:flex items-center gap-0.5 flex-1 justify-center'
          >
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
                <div
                  key={item.label}
                  className='relative'
                >
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      menuAbierto === item.label ? 'bg-gray-800 text-gray-100' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                    <ChevronDown
                      size={13}
                      className={`transition-transform ${menuAbierto === item.label ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {menuAbierto === item.label && (
                    <div className='absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-52 z-50'>
                      {item.hijos.map(hijo => (
                        <NavLink
                          key={hijo.to}
                          to={hijo.to}
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
                  )}
                </div>
              )
            )}
          </nav>

          {/* Usuario + controles */}
          <div className='flex items-center gap-2 shrink-0'>
            <img
              src={usuario.photoURL}
              alt='avatar'
              className='w-7 h-7 rounded-full ring-2 ring-gray-700'
            />
            <span className='text-gray-300 text-sm hidden xl:block truncate max-w-32'>{usuario.displayName}</span>

            {/* ── NUEVO PWA: botón instalar app — solo visible cuando el navegador lo permite ── */}
            <BotonInstalarPWA />

            {/* ── NUEVO: toggle modo privado ── */}
            <button
              onClick={toggleModoPrivado}
              title={modoPrivado ? 'Modo privado activo — pulsa para mostrar valores' : 'Pulsa para ocultar valores'}
              className={`p-1 transition-colors ${
                modoPrivado
                  ? 'text-yellow-400 hover:text-yellow-300' // activo → amarillo
                  : 'text-gray-500 hover:text-gray-300' // inactivo → gris
              }`}
            >
              {modoPrivado ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            {/* ── FIN NUEVO ── */}

            <button
              onClick={handleLogout}
              title='Cerrar sesión'
              className='text-gray-500 hover:text-red-400 transition-colors p-1'
            >
              <LogOut size={15} />
            </button>
            <button
              onClick={() => setMovil(!movil)}
              className='md:hidden text-gray-400 hover:text-gray-100 p-1'
            >
              {movil ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Menú móvil — sin cambios */}
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
