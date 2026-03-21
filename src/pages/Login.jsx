import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()

  return (
    <div className='min-h-screen flex items-center justify-center'>
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-10 flex flex-col items-center gap-6 w-full max-w-sm'>
        <div className='text-center'>
          <div className='text-4xl mb-3'>⚡</div>
          <h1 className='text-xl font-bold text-white'>Trading Dashboard</h1>
          <p className='text-gray-400 text-sm mt-1'>Tu gestor de operaciones personal</p>
        </div>

        <button
          onClick={login}
          className='w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors'
        >
          <img
            src='https://www.google.com/favicon.ico'
            alt='Google'
            className='w-5 h-5'
          />
          Continuar con Google
        </button>

        <p className='text-gray-600 text-xs text-center'>Solo tú tienes acceso a tus datos</p>
      </div>
    </div>
  )
}
