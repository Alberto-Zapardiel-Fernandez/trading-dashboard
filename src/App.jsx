// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
// ── NUEVO WHITELIST: hook de comprobación de acceso ──
import { useWhitelist } from './hooks/useWhitelist'
import Login from './pages/Login'
// ── NUEVO WHITELIST: pantalla de acceso denegado ──
import AccesoDenegado from './pages/AccesoDenegado'
import Dashboard from './pages/Dashboard'
import Historico from './pages/Historico'
import Calculadora from './pages/Calculadora'
import DCA from './pages/DCA'
import Movimientos from './pages/Movimientos'
import Grafica from './pages/Grafica'
import Radar from './pages/Radar'
import Layout from './components/Layout'
import { RadarProvider } from './context/RadarProvider'
import Configuracion from './pages/Configuracion'
import Explorador from './pages/Explorador.jsx'
import Noticias from './pages/Noticias.jsx'
import { ModoPrivadoProvider } from './context/ModoPrivadoProvider'
import ResumenFiscal from './pages/ResumenFiscal.jsx'
import Estadisticas from './pages/Estadisticas.jsx'

export default function App() {
  const { usuario, cargando } = useAuth()
  // ── NUEVO WHITELIST: comprobamos acceso en cuanto hay usuario ──
  const { acceso } = useWhitelist(usuario)

  // Spinner mientras Firebase resuelve la sesión
  if (cargando) {
    return (
      <div className='flex items-center justify-center h-screen'>
        <p className='text-gray-400'>Cargando...</p>
      </div>
    )
  }

  // ── NUEVO WHITELIST ──
  // Si hay usuario pero todavía estamos consultando Firestore → spinner
  if (usuario && acceso === null) {
    return (
      <div className='flex items-center justify-center h-screen'>
        <p className='text-gray-400'>Verificando acceso...</p>
      </div>
    )
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route
          path='/login'
          element={!usuario ? <Login /> : <Navigate to='/' />}
        />

        {/* ── NUEVO WHITELIST: ruta para usuarios sin permiso ── */}
        <Route
          path='/acceso-denegado'
          element={usuario ? <AccesoDenegado /> : <Navigate to='/login' />}
        />

        <Route
          path='/*'
          element={
            !usuario ? (
              // No autenticado → login
              <Navigate to='/login' />
            ) : acceso === false ? (
              // ── NUEVO WHITELIST: autenticado pero no autorizado ──
              <Navigate to='/acceso-denegado' />
            ) : (
              // Autenticado y autorizado → app normal
              <ModoPrivadoProvider>
                <RadarProvider>
                  <Layout usuario={usuario}>
                    <Routes>
                      <Route
                        path='/'
                        element={<Dashboard />}
                      />
                      <Route
                        path='/historico'
                        element={<Historico />}
                      />
                      <Route
                        path='/calculadora'
                        element={<Calculadora />}
                      />
                      <Route
                        path='/dca'
                        element={<DCA />}
                      />
                      <Route
                        path='/movimientos'
                        element={<Movimientos />}
                      />
                      <Route
                        path='/grafica'
                        element={<Grafica />}
                      />
                      <Route
                        path='/radar'
                        element={<Radar />}
                      />
                      <Route
                        path='/configuracion'
                        element={<Configuracion />}
                      />
                      <Route
                        path='/explorador'
                        element={<Explorador />}
                      />
                      <Route
                        path='/noticias'
                        element={<Noticias />}
                      />
                      <Route
                        path='/resumen-fiscal'
                        element={<ResumenFiscal />}
                      />
                      <Route
                        path='/estadisticas'
                        element={<Estadisticas />}
                      />
                    </Routes>
                  </Layout>
                </RadarProvider>
              </ModoPrivadoProvider>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
