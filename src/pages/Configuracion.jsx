import { useState } from 'react'
import { useConfig } from '../hooks/useConfig'
import { useModoPrivado } from '../context/ModoPrivadoContext'

const TELEGRAM_TOKEN = import.meta.env.VITE_TELEGRAM_TOKEN

async function enviarTelegram(chatId, mensaje) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: mensaje, parse_mode: 'Markdown' })
  })
  return res.ok
}

export default function Configuracion() {
  const { config, actualizarConfig } = useConfig()
  const [guardado, setGuardado] = useState(false)
  const [mensajePrueba, setMensajePrueba] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultadoPrueba, setResultadoPrueba] = useState(null)
  const { ocultar } = useModoPrivado()

  const mostrarConfirmacion = () => {
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const handleGuardar = async (campo, valor) => {
    await actualizarConfig({ [campo]: valor })
    mostrarConfirmacion()
  }

  const handleEnviarPrueba = async () => {
    if (!mensajePrueba.trim() || !config.telegramChatId) return
    setEnviando(true)
    setResultadoPrueba(null)
    const ok = await enviarTelegram(config.telegramChatId, mensajePrueba)
    setResultadoPrueba(ok ? 'ok' : 'error')
    setEnviando(false)
    if (ok) setMensajePrueba('')
    setTimeout(() => setResultadoPrueba(null), 3000)
  }

  return (
    <div className='flex flex-col gap-6 py-4'>
      <div>
        <h1 className='text-2xl font-bold text-white'>Configuración</h1>
        <p className='text-gray-500 text-sm mt-1'>Ajustes personales de tu cuenta</p>
      </div>

      <div className='flex gap-6 flex-wrap'>
        {/* ── EUR/USD ── */}
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 flex-1 min-w-72'>
          <div>
            <h2 className='text-gray-200 font-semibold'>Tipo de cambio EUR/USD</h2>
            <p className='text-gray-500 text-sm mt-0.5'>
              Se actualiza automáticamente cada 30 segundos desde Yahoo Finance. Puedes sobreescribirlo manualmente si lo necesitas.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <input
              type='number'
              step='0.0001'
              defaultValue={config.fxEurUsd}
              onBlur={e => handleGuardar('fxEurUsd', parseFloat(e.target.value) || 1)}
              className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-2 text-yellow-400 font-bold w-32 text-center focus:outline-none'
            />
            <span className='text-gray-600 text-sm'>USD por cada EUR</span>
          </div>
          <div className='bg-gray-800/50 rounded-lg p-3 text-sm'>
            <p className='text-gray-400'>
              Valor actual: <span className='text-yellow-400 font-bold'>{config.fxEurUsd}</span>
            </p>
            <p className='text-gray-600 text-xs mt-1'>Usado para convertir operaciones en USD a euros.</p>
          </div>
        </div>

        {/* ── Telegram ── */}
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 flex-1 min-w-72'>
          <div>
            <h2 className='text-gray-200 font-semibold'>Notificaciones Telegram</h2>
            <p className='text-gray-500 text-sm mt-0.5'>
              Introduce tu Chat ID para recibir alertas del radar en Telegram. Para obtenerlo, escribe{' '}
              <span className='text-cyan-400 font-mono'>/start</span> al bot <span className='text-cyan-400 font-mono'>@userinfobot</span> en
              Telegram.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <input
              type='text'
              placeholder='Ej: 878399551'
              defaultValue={config.telegramChatId}
              onBlur={e => handleGuardar('telegramChatId', e.target.value.trim())}
              className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 w-40 text-center focus:outline-none focus:border-yellow-600'
            />
            <span className='text-gray-600 text-sm'>Tu Chat ID numérico</span>
          </div>
          <div className='bg-gray-800/50 rounded-lg p-3 text-sm'>
            <p className='text-gray-400'>
              Estado:{' '}
              {config.telegramChatId ? (
                <span className='text-green-400 font-medium'>
                  {/* Mostramos que está configurado pero ocultamos el ID numérico */}✓ Configurado ({ocultar(config.telegramChatId)})
                </span>
              ) : (
                <span className='text-red-400 font-medium'>✗ Sin configurar</span>
              )}
            </p>
            <p className='text-gray-600 text-xs mt-1'>
              Alertas cuando cambia el estado técnico de un ticker. Silencio nocturno entre las 00:00 y las 08:00.
            </p>
          </div>

          {/* ── Test de mensaje ── */}
          <div className='flex flex-col gap-2'>
            <p className='text-gray-400 text-sm font-medium'>Enviar mensaje de prueba</p>
            <div className='flex gap-2'>
              <input
                type='text'
                placeholder='Escribe un mensaje...'
                value={mensajePrueba}
                onChange={e => setMensajePrueba(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnviarPrueba()}
                className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 flex-1 focus:outline-none focus:border-yellow-600'
              />
              <button
                onClick={handleEnviarPrueba}
                disabled={enviando || !config.telegramChatId}
                className='bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-600 text-white font-bold px-4 py-2 rounded-lg transition-colors'
              >
                {enviando ? '...' : 'Enviar'}
              </button>
            </div>
            {!config.telegramChatId && <p className='text-red-400 text-xs'>Configura tu Chat ID primero</p>}
            {resultadoPrueba === 'ok' && <p className='text-green-400 text-xs'>✓ Mensaje enviado correctamente</p>}
            {resultadoPrueba === 'error' && <p className='text-red-400 text-xs'>✗ Error al enviar. Comprueba el Chat ID</p>}
          </div>
        </div>
      </div>

      {/* ── Confirmación de guardado ── */}
      {guardado && (
        <div className='bg-green-900/30 border border-green-800 rounded-xl px-4 py-3'>
          <p className='text-green-400 text-sm font-medium'>✓ Cambios guardados correctamente</p>
        </div>
      )}
    </div>
  )
}
