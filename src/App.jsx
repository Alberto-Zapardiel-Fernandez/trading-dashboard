import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Historico from './pages/Historico'
import Calculadora from './pages/Calculadora'
import DCA from './pages/DCA'
import Movimientos from './pages/Movimientos'
import Layout from './components/Layout'

export default function App() {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return (
      <div className='flex items-center justify-center h-screen'>
        <p className='text-gray-400'>Cargando...</p>
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
                  <Route
                    path='/movimientos'
                    element={<Movimientos />}
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
