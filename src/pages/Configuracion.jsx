// src/pages/Configuracion.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Ajustes personales del usuario.
// Sección "Alertas del radar" ampliada con todos los controles del motor
// de señales técnicas: RSI, SMA, MACD, volumen y horario de silencio.
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Componente: Toggle on/off ─────────────────────────────────────────────────
function Toggle({ valor, onChange, label, descripcion }) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div className='flex-1'>
        <p className='text-gray-300 text-sm font-medium'>{label}</p>
        {descripcion && <p className='text-gray-600 text-xs mt-0.5'>{descripcion}</p>}
      </div>
      <button
        onClick={() => onChange(!valor)}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${valor ? 'bg-cyan-600' : 'bg-gray-700'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${valor ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

// ── Componente: Slider con etiquetas ──────────────────────────────────────────
function Slider({ valor, onChange, onCommit, min, max, step = 1, label, valorLabel, colorValor = 'text-cyan-400', izquierda, derecha }) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <label className='text-gray-300 text-sm font-medium'>{label}</label>
        <span className={`text-xl font-bold tabular-nums ${colorValor}`}>{valorLabel ?? valor}</span>
      </div>
      <input
        type='range'
        min={min}
        max={max}
        step={step}
        value={valor}
        onChange={e => onChange(Number(e.target.value))}
        onMouseUp={e => onCommit(Number(e.target.value))}
        onTouchEnd={e => onCommit(Number(e.target.value))}
        className='w-full accent-cyan-500'
      />
      {(izquierda || derecha) && (
        <div className='flex justify-between text-xs text-gray-600'>
          <span>{izquierda}</span>
          <span>{derecha}</span>
        </div>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Configuracion() {
  const { config, actualizarConfig } = useConfig()
  const { ocultar } = useModoPrivado()

  const [guardado, setGuardado] = useState(false)
  const [mensajePrueba, setMensajePrueba] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultadoPrueba, setResultadoPrueba] = useState(null)

  // Estados locales de sliders — respuesta inmediata en UI,
  // se persiste en Firestore solo al soltar (onCommit)
  const [rsiLocal, setRsiLocal] = useState(null)
  const [silencioDesdeLocal, setSilencioDesdeLocal] = useState(null)
  const [silencioHastaLocal, setSilencioHastaLocal] = useState(null)

  const umbraRsi = rsiLocal ?? config.umbraRsiSobreventa ?? 30
  const silencioDesde = silencioDesdeLocal ?? config.silencioDesde ?? 23
  const silencioHasta = silencioHastaLocal ?? config.silencioHasta ?? 7

  const ok = async (campo, valor) => {
    await actualizarConfig({ [campo]: valor })
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const handleEnviarPrueba = async () => {
    if (!mensajePrueba.trim() || !config.telegramChatId) return
    setEnviando(true)
    setResultadoPrueba(null)
    const exito = await enviarTelegram(config.telegramChatId, mensajePrueba)
    setResultadoPrueba(exito ? 'ok' : 'error')
    setEnviando(false)
    if (exito) setMensajePrueba('')
    setTimeout(() => setResultadoPrueba(null), 3000)
  }

  // Color del umbral RSI
  const colorRsi = umbraRsi <= 25 ? 'text-teal-400' : umbraRsi <= 30 ? 'text-cyan-400' : 'text-yellow-400'

  return (
    <div className='flex flex-col gap-6 py-4'>
      <div>
        <h1 className='text-2xl font-bold text-white'>Configuración</h1>
        <p className='text-gray-500 text-sm mt-1'>Ajustes personales de tu cuenta</p>
      </div>

      {/* ── Fila superior: EUR/USD + Telegram ── */}
      <div className='flex gap-6 flex-wrap'>
        {/* EUR/USD */}
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 flex-1 min-w-72'>
          <div>
            <h2 className='text-gray-200 font-semibold'>Tipo de cambio EUR/USD</h2>
            <p className='text-gray-500 text-sm mt-0.5'>Se actualiza automáticamente cada 30 s desde Yahoo Finance.</p>
          </div>
          <div className='flex items-center gap-3'>
            <input
              type='number'
              step='0.0001'
              defaultValue={config.fxEurUsd}
              onBlur={e => ok('fxEurUsd', parseFloat(e.target.value) || 1)}
              className='bg-gray-800 border border-yellow-600 rounded-lg px-3 py-2
                         text-yellow-400 font-bold w-32 text-center focus:outline-none'
            />
            <span className='text-gray-600 text-sm'>USD por EUR</span>
          </div>
          <div className='bg-gray-800/50 rounded-lg p-3 text-sm'>
            <p className='text-gray-400'>
              Valor actual: <span className='text-yellow-400 font-bold'>{config.fxEurUsd}</span>
            </p>
          </div>
        </div>

        {/* Telegram */}
        <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 flex-1 min-w-72'>
          <div>
            <h2 className='text-gray-200 font-semibold'>Notificaciones Telegram</h2>
            <p className='text-gray-500 text-sm mt-0.5'>
              Escribe <span className='text-cyan-400 font-mono'>/start</span> al bot <span className='text-cyan-400 font-mono'>@userinfobot</span>{' '}
              para obtener tu Chat ID.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <input
              type='text'
              placeholder='Ej: 878399551'
              defaultValue={config.telegramChatId}
              onBlur={e => ok('telegramChatId', e.target.value.trim())}
              className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                         text-gray-300 w-40 text-center focus:outline-none focus:border-yellow-600'
            />
          </div>
          <div className='bg-gray-800/50 rounded-lg p-3 text-sm'>
            <p className='text-gray-400'>
              Estado:{' '}
              {config.telegramChatId ? (
                <span className='text-green-400 font-medium'>✓ Configurado ({ocultar(config.telegramChatId)})</span>
              ) : (
                <span className='text-red-400 font-medium'>✗ Sin configurar</span>
              )}
            </p>
          </div>
          <div className='flex flex-col gap-2'>
            <p className='text-gray-400 text-sm font-medium'>Mensaje de prueba</p>
            <div className='flex gap-2'>
              <input
                type='text'
                placeholder='Escribe un mensaje...'
                value={mensajePrueba}
                onChange={e => setMensajePrueba(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnviarPrueba()}
                className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                           text-gray-300 flex-1 focus:outline-none focus:border-yellow-600'
              />
              <button
                onClick={handleEnviarPrueba}
                disabled={enviando || !config.telegramChatId}
                className='bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700
                           disabled:text-gray-600 text-white font-bold px-4 py-2 rounded-lg transition-colors'
              >
                {enviando ? '...' : 'Enviar'}
              </button>
            </div>
            {resultadoPrueba === 'ok' && <p className='text-green-400 text-xs'>✓ Enviado correctamente</p>}
            {resultadoPrueba === 'error' && <p className='text-red-400 text-xs'>✗ Error. Comprueba el Chat ID</p>}
          </div>
        </div>
      </div>

      {/* ── Alertas del radar ── */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-6'>
        <div>
          <h2 className='text-gray-200 font-semibold'>Alertas del radar</h2>
          <p className='text-gray-500 text-sm mt-0.5'>
            Controla qué señales recibes y con qué sensibilidad. El motor comprueba los tickers cada 30 minutos.
          </p>
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 gap-8'>
          {/* Columna izquierda: sliders */}
          <div className='flex flex-col gap-5'>
            <p className='text-gray-500 text-xs uppercase tracking-wider font-medium'>Sensibilidad</p>

            {/* RSI */}
            <Slider
              label='Umbral RSI sobreventa'
              valor={umbraRsi}
              min={20}
              max={40}
              colorValor={colorRsi}
              onChange={setRsiLocal}
              onCommit={v => {
                ok('umbraRsiSobreventa', v)
                setRsiLocal(null)
              }}
              izquierda='20 — muy sensible'
              derecha='40 — conservador'
            />
            <div className='bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500'>
              {umbraRsi <= 25 && '⚡ Solo alerta en sobreventa extrema. Ideal para activos que permanecen días en zona baja.'}
              {umbraRsi > 25 &&
                umbraRsi <= 30 &&
                '✓ Estándar recomendado. Alerta cuando RSI < ' + umbraRsi + ' (sobrecompra > ' + (100 - umbraRsi) + ').'}
              {umbraRsi > 30 && '⚠ Más frecuente. Puede generar señales en correcciones normales de mercado.'}
            </div>

            {/* Horario de silencio */}
            <div className='flex flex-col gap-3'>
              <p className='text-gray-300 text-sm font-medium'>Horario de silencio nocturno</p>
              <div className='grid grid-cols-2 gap-3'>
                <Slider
                  label='Desde (hora UTC)'
                  valor={silencioDesde}
                  min={18}
                  max={23}
                  colorValor='text-gray-300'
                  onChange={setSilencioDesdeLocal}
                  onCommit={v => {
                    ok('silencioDesde', v)
                    setSilencioDesdeLocal(null)
                  }}
                />
                <Slider
                  label='Hasta (hora UTC)'
                  valor={silencioHasta}
                  min={5}
                  max={10}
                  colorValor='text-gray-300'
                  onChange={setSilencioHastaLocal}
                  onCommit={v => {
                    ok('silencioHasta', v)
                    setSilencioHastaLocal(null)
                  }}
                />
              </div>
              <p className='text-gray-600 text-xs'>
                Silencio actual: {silencioDesde}:00 UTC → {silencioHasta}:00 UTC (≈ {silencioDesde + 1}h–{silencioHasta + 1}h España invierno)
              </p>
            </div>
          </div>

          {/* Columna derecha: toggles de señales */}
          <div className='flex flex-col gap-4'>
            <p className='text-gray-500 text-xs uppercase tracking-wider font-medium'>Tipos de señal activos</p>

            {/* RSI siempre activo — no se puede desactivar */}
            <div className='flex items-start gap-3 opacity-50'>
              <div className='w-11 h-6 rounded-full bg-cyan-600 relative shrink-0 mt-0.5'>
                <span className='absolute top-0.5 translate-x-5 w-5 h-5 rounded-full bg-white shadow' />
              </div>
              <div>
                <p className='text-gray-300 text-sm font-medium'>RSI sobreventa / sobrecompra</p>
                <p className='text-gray-600 text-xs'>Siempre activo · umbral configurable arriba</p>
              </div>
            </div>

            <Toggle
              valor={config.alertasCrucesSma ?? true}
              onChange={v => ok('alertasCrucesSma', v)}
              label='Cruces de medias (SMA50/SMA200)'
              descripcion='Cruce dorado, cruce de la muerte, y precio cruzando SMA200'
            />

            <Toggle
              valor={config.alertasMacd ?? true}
              onChange={v => ok('alertasMacd', v)}
              label='MACD — cruces de señal'
              descripcion='Cruce alcista (histograma positivo) y bajista (histograma negativo)'
            />

            <Toggle
              valor={config.alertasVolumen ?? true}
              onChange={v => ok('alertasVolumen', v)}
              label='Volumen anómalo'
              descripcion='Avisa cuando el volumen supera 2× la media de 20 días'
            />

            {/* Nota informativa */}
            <div className='bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500 mt-1'>
              <p className='font-medium text-gray-400 mb-1'>ℹ️ Anti-spam automático</p>
              Cada señal solo se envía una vez por ciclo. Si el RSI lleva días en sobreventa no recibirás una alerta cada 30 minutos — solo cuando
              entre y cuando salga de la zona.
            </div>
          </div>
        </div>
      </div>

      {/* Confirmación */}
      {guardado && (
        <div className='bg-green-900/30 border border-green-800 rounded-xl px-4 py-3'>
          <p className='text-green-400 text-sm font-medium'>✓ Cambios guardados correctamente</p>
        </div>
      )}
    </div>
  )
}
