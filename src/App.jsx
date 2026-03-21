import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Historico from './pages/Historico'
import Calculadora from './pages/Calculadora'
import DCA from './pages/DCA'
import Layout from './components/Layout'

export default function App() {
  const { usuario, cargando } = useAuth()

  // Mientras comprueba si hay sesión activa
  if (cargando) {
    return (
      <div className='flex items-center justify-center h-screen'>
        <p className='text-gray-400'>Cargando...</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública — login */}
        <Route
          path='/login'
          element={!usuario ? <Login /> : <Navigate to='/' />}
        />

        {/* Rutas protegidas — solo si hay sesión */}
        <Route
          path='/*'
          element={
            usuario ? (
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
                </Routes>
              </Layout>
            ) : (
              <Navigate to='/login' />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
