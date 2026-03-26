// ─────────────────────────────────────────────────────────────────────────────
// Layout.jsx — Estructura principal: navbar + contenido
//
// CAMBIOS Sprint 18:
//   · Menú desplegable de escritorio se abre con hover (onMouseEnter/Leave)
//     en lugar de requerir click. En móvil sigue funcionando con click.
//   · El array NAV actualiza "DCA VUSA" → "Cartera Bunker"
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

// ── Componente interno: ítem de menú con submenú (escritorio) ─────────────────
// Solución CSS pura con Tailwind 'group' + 'group-hover'.
// Sin estado React, sin timeouts — el navegador gestiona el hover de forma
// nativa, lo que elimina cualquier parpadeo o problema de timing.
//
// Truco clave: el panel tiene 'pt-2' (padding-top invisible) que "tapa" el
// hueco de 4px entre el botón y el borde del dropdown, evitando que el
// ratón "salga" del grupo al cruzar ese hueco y cierre el menú.
function MenuDesplegable({ item }) {
  return (
    <div className='relative group'>
      {/* Botón — se ilumina cuando el grupo (contenedor) está en hover */}
      <button
        className='flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium
                   transition-colors whitespace-nowrap
                   text-gray-400 group-hover:text-gray-100 group-hover:bg-gray-800'
      >
        {item.label}
        <ChevronDown
          size={13}
          className='transition-transform group-hover:rotate-180'
        />
      </button>

      {/* Panel desplegable:
          · 'invisible opacity-0' → oculto por defecto (pero ocupa espacio en el DOM,
            lo que es clave para que el hover no se rompa)
          · 'group-hover:visible group-hover:opacity-100' → visible al hacer hover
          · 'pt-2' → padding superior que cubre el hueco entre botón y panel,
            manteniendo el grupo activo mientras el ratón cruza ese espacio */}
      <div
        className='absolute top-full left-0 pt-2 invisible opacity-0
                   group-hover:visible group-hover:opacity-100
                   transition-opacity duration-100 z-50'
      >
        <div className='bg-gray-900 border border-gray-700 rounded-xl shadow-xl py-1 min-w-52'>
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
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Layout({ children, usuario }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { modoPrivado, toggleModoPrivado } = useModoPrivado()

  // El menú móvil sigue siendo toggle por click (no tiene hover en táctil)
  const [movil, setMovil] = useState(false)

  // Cerrar menú al navegar
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            className='text-yellow-400 font-bold tracking-tight whitespace-nowrap shrink-0 hover:text-yellow-300 transition-colors'
          >
            <span className='hidden lg:inline text-base'>⚡ Trading Dashboard</span>
            <span className='lg:hidden text-lg'>⚡</span>
          </NavLink>

          {/* ── Navegación escritorio ── */}
          <nav className='hidden md:flex items-center gap-0.5 flex-1 justify-center'>
            {NAV.map(item =>
              item.to ? (
                // Enlace directo sin submenú
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
                // Menú con submenú — ahora con hover gestionado por componente propio
                <MenuDesplegable
                  key={item.label}
                  item={item}
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

            {/* Botón instalar PWA — solo visible si el navegador lo permite */}
            <BotonInstalarPWA />

            {/* Toggle modo privado */}
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

            {/* Separador + botón hamburguesa — solo móvil */}
            <div className='md:hidden w-px h-5 bg-gray-700 mx-1' />
            <button
              onClick={() => setMovil(!movil)}
              className='md:hidden text-gray-400 hover:text-gray-100 p-2'
            >
              {movil ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── Menú móvil — click, sin hover (no aplica en táctil) ── */}
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
                  {/* Cabecera de sección en móvil */}
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
