// ─────────────────────────────────────────────────────────────────────────────
// Calculadora.jsx — Calculadora de entrada de posiciones
//
// NOVEDADES:
//   · Búsqueda inteligente de ticker via Yahoo Finance (buscarTickers)
//   · Botón guardar integrado en el bloque de inputs
//   · Capital más compacto en la misma fila que el resto de controles
//   · Un único bloque de inputs → tabla de escenarios debajo → resultados
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { db } from '../config/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { COLECCIONES } from '../config/constants'
import { useMovimientos } from '../hooks/useMovimientos'
import { useConfig } from '../hooks/useConfig'
import { buscarTickers } from '../services/yahooFinance'

function esRedondo(precio) {
  if (!precio || precio <= 0) return false
  return Math.round(precio * 100) % 5 === 0
}

const fmt2 = n => (n ?? 0).toFixed(2)
const fmt3 = n => (n ?? 0).toFixed(3)

export default function Calculadora() {
  const { usuario } = useAuth()
  const { totalMovimientos } = useMovimientos()
  const { config } = useConfig()

  // ── Estado principal ──────────────────────────────────────────────────────
  const [capitalManual, setCapitalManual] = useState(null)
  const [modo, setModo] = useState('auto')
  const [form, setForm] = useState({
    ticker: '',
    moneda: 'EUR',
    precioEntrada: '',
    stopLoss: '',
    numAcciones: '',
    precioObjetivo: ''
  })
  const [pctRiesgo, setPctRiesgo] = useState(3)
  const [fxEurUsd, setFxEurUsd] = useState(config.fxEurUsd || 1.15)

  // ── Búsqueda inteligente de ticker ────────────────────────────────────────
  const [sugerencias, setSugerencias] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [mostrarDropdown, setMostrarDropdown] = useState(false)
  const tickerRef = useRef(null)
  const debounceRef = useRef(null)

  // Busca en Yahoo con debounce de 350ms para no saturar la API
  const handleTickerChange = valor => {
    setForm(f => ({ ...f, ticker: valor.toUpperCase() }))
    setMostrarDropdown(true)

    clearTimeout(debounceRef.current)
    if (valor.length < 2) {
      setSugerencias([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      const resultados = await buscarTickers(valor)
      setSugerencias(resultados)
      setBuscando(false)
    }, 350)
  }

  // Al seleccionar una sugerencia
  const seleccionarTicker = s => {
    setForm(f => ({ ...f, ticker: s.symbol }))
    setSugerencias([])
    setMostrarDropdown(false)
  }

  // Cerrar el dropdown al hacer click fuera
  useEffect(() => {
    const handleClick = e => {
      if (tickerRef.current && !tickerRef.current.contains(e.target)) {
        setMostrarDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }))

  // ── Capital efectivo ──────────────────────────────────────────────────────
  const capitalEfectivo = capitalManual !== null ? capitalManual : totalMovimientos || 0

  // ── Valores parseados ─────────────────────────────────────────────────────
  const entrada = parseFloat(form.precioEntrada) || 0
  const stop = parseFloat(form.stopLoss) || 0
  const accionesManual = parseFloat(form.numAcciones) || 0
  const objetivo = parseFloat(form.precioObjetivo) || 0

  // ── Riesgo dinámico ───────────────────────────────────────────────────────
  const riesgoEuros = capitalEfectivo * (pctRiesgo / 100)
  const precioEuros = form.moneda === 'USD' ? entrada / fxEurUsd : entrada

  // ── Cálculos modo automático ──────────────────────────────────────────────
  const distanciaEuros = entrada > stop && entrada > 0 && stop > 0 ? (form.moneda === 'USD' ? (entrada - stop) / fxEurUsd : entrada - stop) : 0

  const accionesAuto = distanciaEuros > 0 ? riesgoEuros / distanciaEuros : 0
  const inversionAuto = form.moneda === 'USD' ? (accionesAuto * entrada) / fxEurUsd : accionesAuto * entrada

  // ── Cálculos modo manual ──────────────────────────────────────────────────
  const inversionManual = form.moneda === 'USD' ? (accionesManual * entrada) / fxEurUsd : accionesManual * entrada
  const riesgoManual = distanciaEuros > 0 ? accionesManual * distanciaEuros : 0
  const pctRiesgoManual = capitalEfectivo > 0 && riesgoManual > 0 ? (riesgoManual / capitalEfectivo) * 100 : 0

  // ── Valores efectivos ─────────────────────────────────────────────────────
  const accionesEfectivas = modo === 'auto' ? accionesAuto : accionesManual
  const inversionEfectiva = modo === 'auto' ? inversionAuto : inversionManual
  const riesgoEfectivo = modo === 'auto' ? riesgoEuros : riesgoManual

  // ── Ratio R/B ─────────────────────────────────────────────────────────────
  const ratioRB =
    objetivo > entrada && distanciaEuros > 0 ? (form.moneda === 'USD' ? (objetivo - entrada) / fxEurUsd : objetivo - entrada) / distanciaEuros : 0
  const beneficioPrevisto =
    objetivo > entrada && accionesEfectivas > 0
      ? form.moneda === 'USD'
        ? ((objetivo - entrada) * accionesEfectivas) / fxEurUsd
        : (objetivo - entrada) * accionesEfectivas
      : 0

  const tp2a1 = entrada > stop && stop > 0 ? entrada + (entrada - stop) * 2 : null
  const tp3a1 = entrada > stop && stop > 0 ? entrada + (entrada - stop) * 3 : null

  // ── Mercado ───────────────────────────────────────────────────────────────
  const esAmericana = form.ticker && !form.ticker.includes('.')
  const ratioMinimo = esAmericana ? 3 : 2
  const stopEsRedondo = esRedondo(stop)

  // ── Tabla de escenarios ───────────────────────────────────────────────────
  const accionesMax = precioEuros > 0 ? Math.floor(capitalEfectivo / precioEuros) : 0

  const escenarios = useMemo(() => {
    if (accionesMax <= 0 || entrada <= 0) return []
    const paso = Math.max(1, Math.round(accionesMax / 7))
    const filas = []
    for (let acc = accionesMax; acc >= Math.max(1, Math.round(accionesMax * 0.4)); acc -= paso) {
      const inv = form.moneda === 'USD' ? (acc * entrada) / fxEurUsd : acc * entrada
      const pctCap = capitalEfectivo > 0 ? (inv / capitalEfectivo) * 100 : 0
      const dist = riesgoEuros / acc
      const pStop = form.moneda === 'USD' ? entrada - dist * fxEurUsd : entrada - dist
      const distPct = precioEuros > 0 ? (dist / precioEuros) * 100 : 0
      filas.push({ acc, inv, pctCap, dist, pStop, distPct, redondo: esRedondo(pStop) })
    }
    return filas
  }, [accionesMax, entrada, riesgoEuros, form.moneda, fxEurUsd, capitalEfectivo, precioEuros])

  const seleccionarFila = e => {
    set('stopLoss', fmt3(e.pStop))
    set('numAcciones', String(e.acc))
    setModo('manual')
  }

  // ── Guardar operación ─────────────────────────────────────────────────────
  // hayResultados es true cuando hay suficientes datos para mostrar y guardar.
  // En modo manual: si el campo numAcciones está vacío pero hay acciones calculadas
  // en automático (accionesAuto > 0), también es válido — el usuario acaba de
  // cambiar de modo y los datos siguen siendo correctos.
  const hayResultados = entrada > 0 && stop > 0 && entrada > stop && (modo === 'auto' || accionesManual > 0 || accionesAuto > 0)

  const puedeGuardar = hayResultados && form.ticker.length > 0

  const guardarOperacion = async () => {
    if (!puedeGuardar) return
    await addDoc(collection(db, 'users', usuario.uid, COLECCIONES.OPERACIONES), {
      ticker: form.ticker.toUpperCase(),
      moneda: form.moneda,
      precioEntrada: entrada,
      stopLoss: stop,
      precioObjetivo: objetivo || null,
      numAcciones: parseFloat(accionesEfectivas.toFixed(4)),
      inversion: parseFloat(inversionEfectiva.toFixed(2)),
      fxCompra: form.moneda === 'USD' ? fxEurUsd : 1,
      estado: 'ABIERTA',
      pnlVivo: 0,
      precioActual: null,
      notas: modo === 'manual' ? '(entrada manual)' : '',
      fechaApertura: new Date().toISOString().split('T')[0],
      creadoEn: serverTimestamp()
    })
    alert(`✅ Operación ${form.ticker.toUpperCase()} guardada como ABIERTA`)
    setForm({ ticker: '', moneda: 'EUR', precioEntrada: '', stopLoss: '', numAcciones: '', precioObjetivo: '' })
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const colorSlider = pctRiesgo <= 2 ? 'text-green-400' : pctRiesgo <= 3 ? 'text-cyan-400' : pctRiesgo <= 4 ? 'text-yellow-400' : 'text-red-400'

  const inputBase =
    'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 outline-none text-gray-200 focus:border-blue-500 w-full transition-colors text-sm'

  return (
    <div className='flex flex-col gap-6 py-4'>
      {/* ── Cabecera ── */}
      <div>
        <h2 className='text-lg font-bold text-gray-200'>Calculadora de entrada</h2>
        <p className='text-gray-500 text-sm'>
          Riesgo máximo: <span className='text-orange-400 font-bold'>{pctRiesgo}% del capital</span>
          {capitalEfectivo > 0 && <span className='text-orange-600'> ({fmt2(riesgoEuros)} €)</span>}
          {' · '}Ratio mínimo {ratioMinimo}:1 ({esAmericana ? 'americana' : 'europea'})
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* BLOQUE DE INPUTS                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4'>
        {/* Fila 1: Capital (compacto) + Toggle auto/manual */}
        <div className='flex items-center gap-3 flex-wrap'>
          {/* Capital — compacto, en línea */}
          <div className='flex items-center gap-2 flex-1 min-w-0'>
            <label className='text-gray-400 text-xs whitespace-nowrap'>
              Capital:
              {capitalManual !== null && <span className='text-yellow-500 ml-1'>simulación</span>}
            </label>
            <div className='relative w-36'>
              <input
                type='number'
                step='0.01'
                min='0'
                value={capitalManual !== null ? capitalManual : parseFloat(fmt2(totalMovimientos || 0))}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setCapitalManual(isNaN(v) ? null : v)
                }}
                className={`w-full bg-gray-800 border rounded-lg px-3 py-2 pr-7 text-sm
                            font-bold outline-none transition-colors ${
                              capitalManual !== null ? 'border-yellow-600 text-yellow-400' : 'border-blue-700 text-blue-300'
                            }`}
              />
              <span className='absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs'>€</span>
            </div>
            {capitalManual !== null && (
              <button
                onClick={() => setCapitalManual(null)}
                className='text-xs text-gray-500 hover:text-gray-300 whitespace-nowrap transition-colors'
              >
                ↺ {fmt2(totalMovimientos || 0)} €
              </button>
            )}
          </div>

          {/* Toggle auto/manual */}
          <div className='flex items-center gap-2'>
            <div className='flex bg-gray-800 rounded-lg p-0.5 gap-0.5'>
              <button
                onClick={() => setModo('auto')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  modo === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Automático
              </button>
              <button
                onClick={() => setModo('manual')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  modo === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Manual
              </button>
            </div>
            <span className='text-gray-600 text-xs hidden sm:block'>{modo === 'auto' ? `Stop → calcula acciones` : 'Acciones → calcula riesgo'}</span>
          </div>

          {/* Botón guardar — en la misma fila, a la derecha */}
          <button
            onClick={guardarOperacion}
            disabled={!puedeGuardar}
            className={`ml-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              puedeGuardar ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
            title={!form.ticker ? 'Introduce el ticker' : !hayResultados ? 'Introduce precio y stop' : 'Guardar operación'}
          >
            {puedeGuardar ? '✓ Guardar operación →' : '— Guardar operación'}
          </button>
        </div>

        {/* Fila 2: Ticker (con búsqueda) + Moneda + Precio entrada */}
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
          {/* Ticker con autocompletado */}
          <div
            className='flex flex-col gap-1 relative'
            ref={tickerRef}
          >
            <label className='text-gray-400 text-xs'>Ticker</label>
            <input
              value={form.ticker}
              onChange={e => handleTickerChange(e.target.value)}
              onFocus={() => sugerencias.length > 0 && setMostrarDropdown(true)}
              placeholder='Busca: SAN, Santander...'
              autoComplete='off'
              className={inputBase + ' text-cyan-400 font-medium'}
            />
            {/* Indicador de búsqueda */}
            {buscando && <p className='text-gray-600 text-xs'>Buscando...</p>}
            {form.ticker && !buscando && <p className='text-gray-600 text-xs'>{esAmericana ? '🇺🇸 Ratio mín. 3:1' : '🇪🇺 Ratio mín. 2:1'}</p>}

            {/* Dropdown de sugerencias */}
            {mostrarDropdown && sugerencias.length > 0 && (
              <div
                className='absolute top-full left-0 right-0 z-50 mt-1
                              bg-gray-800 border border-gray-700 rounded-xl
                              shadow-xl overflow-hidden'
              >
                {sugerencias.map(s => (
                  <button
                    key={s.symbol}
                    onMouseDown={() => seleccionarTicker(s)}
                    className='w-full flex items-center justify-between px-3 py-2.5
                               hover:bg-gray-700 transition-colors text-left border-b
                               border-gray-700/50 last:border-0'
                  >
                    <div>
                      <span className='text-cyan-400 font-bold text-sm'>{s.symbol}</span>
                      <span className='text-gray-400 text-xs ml-2 truncate max-w-32 inline-block align-bottom'>{s.nombre}</span>
                    </div>
                    <span className='text-gray-600 text-xs ml-2'>{s.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Moneda */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Moneda</label>
            <select
              value={form.moneda}
              onChange={e => set('moneda', e.target.value)}
              className={inputBase + ' text-yellow-400 font-medium'}
            >
              <option value='EUR'>EUR</option>
              <option value='USD'>USD</option>
            </select>
            {form.moneda === 'USD' && (
              <div className='flex items-center gap-1 text-xs text-gray-600'>
                <span>EUR/USD:</span>
                <input
                  type='number'
                  step='0.0001'
                  value={fxEurUsd}
                  onChange={e => setFxEurUsd(parseFloat(e.target.value) || 1)}
                  className='bg-gray-800 border border-gray-700 rounded px-2 py-0.5
                             text-yellow-500 w-20 outline-none text-center text-xs'
                />
              </div>
            )}
          </div>

          {/* Precio de entrada */}
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Precio de entrada</label>
            <input
              type='number'
              step='0.001'
              value={form.precioEntrada}
              onChange={e => set('precioEntrada', e.target.value)}
              placeholder='0.000'
              className={inputBase + ' border-blue-700 text-blue-300 font-bold'}
            />
          </div>
        </div>

        {/* Fila 3: Stop + Acciones (manual) + Precio objetivo */}
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>Stop loss</label>
            <input
              type='number'
              step='0.001'
              value={form.stopLoss}
              onChange={e => set('stopLoss', e.target.value)}
              placeholder='Número feo, ej: 19.37'
              className={`${inputBase} ${stopEsRedondo && stop > 0 ? 'border-yellow-600 text-yellow-400' : 'border-red-800 text-red-400'}`}
            />
            {stopEsRedondo && stop > 0 && (
              <p className='text-yellow-500 text-xs'>
                ⚠ Redondo — usa {fmt3(stop - 0.03)} o {fmt3(stop + 0.03)}
              </p>
            )}
          </div>

          {modo === 'manual' && (
            <div className='flex flex-col gap-1'>
              <label className='text-gray-400 text-xs'>Nº acciones</label>
              <input
                type='number'
                step='1'
                min='0'
                value={form.numAcciones}
                onChange={e => set('numAcciones', e.target.value)}
                placeholder='48'
                className={inputBase + ' border-cyan-700 text-cyan-400 font-bold'}
              />
            </div>
          )}

          <div className='flex flex-col gap-1'>
            <label className='text-gray-400 text-xs'>
              Precio objetivo
              {!esAmericana && tp2a1 && <span className='text-gray-600 ml-1'>(2:1 → {fmt3(tp2a1)})</span>}
              {esAmericana && tp3a1 && <span className='text-gray-600 ml-1'>(3:1 → {fmt3(tp3a1)})</span>}
            </label>
            <input
              type='number'
              step='0.001'
              value={form.precioObjetivo}
              onChange={e => set('precioObjetivo', e.target.value)}
              placeholder={esAmericana && tp3a1 ? fmt3(tp3a1) : tp2a1 ? fmt3(tp2a1) : 'Opcional'}
              className={inputBase + ' border-green-800 text-green-400'}
            />
          </div>
        </div>

        {/* Fila 4: Slider de riesgo */}
        <div className='flex flex-col gap-2 border-t border-gray-800 pt-4'>
          <div className='flex items-center justify-between'>
            <label className='text-gray-300 text-sm font-medium'>Riesgo por operación</label>
            <div className='flex items-baseline gap-2'>
              <span className={`text-xl font-bold ${colorSlider}`}>{pctRiesgo}%</span>
              {capitalEfectivo > 0 && <span className={`text-sm font-medium ${colorSlider}`}>= {fmt2(riesgoEuros)} €</span>}
            </div>
          </div>
          <input
            type='range'
            min='1'
            max='5'
            step='0.5'
            value={pctRiesgo}
            onChange={e => setPctRiesgo(parseFloat(e.target.value))}
            className='w-full accent-cyan-500'
          />
          <div className='flex justify-between text-xs text-gray-600'>
            <span>1% conservador</span>
            <span className='text-cyan-700'>3% protocolo</span>
            <span>5% agresivo</span>
          </div>
          {pctRiesgo > 3 && <p className='text-yellow-600 text-xs'>⚠ Por encima del 3% recomendado</p>}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TABLA DE ESCENARIOS                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {escenarios.length > 0 && (
        <div>
          <div className='flex items-baseline justify-between mb-2'>
            <h3 className='text-base font-bold text-gray-200'>Escenarios de posición</h3>
            <p className='text-gray-600 text-xs'>
              Click en una fila → rellena el formulario · riesgo {fmt2(riesgoEuros)} € ({pctRiesgo}%)
            </p>
          </div>
          <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider'>
                  <th className='text-left p-3 font-medium'>Acciones</th>
                  <th className='text-right p-3 font-medium'>Inversión</th>
                  <th className='text-right p-3 font-medium hidden sm:table-cell'>% capital</th>
                  <th className='text-right p-3 font-medium'>Stop loss</th>
                  <th className='text-right p-3 font-medium hidden sm:table-cell'>Distancia</th>
                  <th className='text-right p-3 font-medium hidden sm:table-cell'>Dist %</th>
                </tr>
              </thead>
              <tbody>
                {escenarios.map((e, idx) => {
                  const esRecomendado = idx === 0
                  const esSeleccionada = form.numAcciones === String(e.acc) && form.stopLoss === fmt3(e.pStop)
                  const color =
                    e.pctCap >= 90 ? 'text-green-400' : e.pctCap >= 70 ? 'text-cyan-400' : e.pctCap >= 55 ? 'text-yellow-400' : 'text-gray-500'

                  return (
                    <tr
                      key={e.acc}
                      onClick={() => seleccionarFila(e)}
                      title='Click para usar estos valores'
                      className={`border-b border-gray-800 last:border-0 cursor-pointer transition-colors ${
                        esSeleccionada
                          ? 'bg-blue-900/30 hover:bg-blue-900/40'
                          : esRecomendado
                            ? 'bg-green-900/10 hover:bg-green-900/25'
                            : 'hover:bg-gray-800/60'
                      }`}
                    >
                      <td className={`p-3 font-bold ${color}`}>
                        {e.acc}
                        {esRecomendado && !esSeleccionada && <span className='text-green-800 font-normal text-xs ml-2'>recomendado</span>}
                        {esSeleccionada && <span className='text-blue-400 font-normal text-xs ml-2'>← seleccionado</span>}
                      </td>
                      <td className={`p-3 text-right font-medium ${color}`}>{fmt2(e.inv)} €</td>
                      <td className='p-3 text-right text-gray-500 hidden sm:table-cell'>{e.pctCap.toFixed(1)}%</td>
                      <td className='p-3 text-right'>
                        <span className={`font-bold ${e.redondo ? 'text-yellow-400' : 'text-red-400'}`}>{fmt3(e.pStop)}</span>
                        {e.redondo && <span className='text-yellow-600 text-xs ml-1'>⚠</span>}
                      </td>
                      <td className='p-3 text-right text-gray-400 hidden sm:table-cell'>{fmt3(e.dist)} €</td>
                      <td className='p-3 text-right text-gray-500 hidden sm:table-cell'>{e.distPct.toFixed(2)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className='text-gray-700 text-xs mt-1'>⚠ Stops en amarillo son números redondos — ajusta céntimos a la baja.</p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* RESULTADOS                                                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {hayResultados && (
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-500 text-xs mb-1'>{modo === 'auto' ? 'Nº acciones' : 'Nº acciones (manual)'}</p>
            <p className='text-cyan-400 text-2xl font-bold'>{modo === 'auto' ? fmt2(accionesEfectivas) : accionesManual}</p>
            {modo === 'auto' && <p className='text-gray-600 text-xs mt-0.5'>Para arriesgar {fmt2(riesgoEuros)} €</p>}
          </div>

          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-500 text-xs mb-1'>Inversión total</p>
            <p className='text-white text-2xl font-bold'>{fmt2(inversionEfectiva)} €</p>
            {inversionEfectiva > capitalEfectivo && <p className='text-red-400 text-xs mt-0.5'>⚠ Supera el capital</p>}
          </div>

          <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
            <p className='text-gray-500 text-xs mb-1'>Riesgo real</p>
            <p className={`text-2xl font-bold ${modo === 'manual' && riesgoManual > riesgoEuros * 1.1 ? 'text-red-400' : 'text-orange-400'}`}>
              {fmt2(riesgoEfectivo)} €
            </p>
            {modo === 'manual' ? (
              <p className={`text-xs mt-0.5 ${riesgoManual > riesgoEuros ? 'text-red-500' : 'text-gray-600'}`}>
                {pctRiesgoManual.toFixed(2)}% del capital
                {riesgoManual > riesgoEuros && ` ⚠ supera el ${pctRiesgo}%`}
              </p>
            ) : (
              <p className='text-gray-600 text-xs mt-0.5'>{pctRiesgo}% del capital</p>
            )}
          </div>

          <div
            className={`bg-gray-900 border rounded-xl p-4 ${
              ratioRB > 0 ? (ratioRB >= ratioMinimo ? 'border-green-900' : 'border-red-900') : 'border-gray-800'
            }`}
          >
            <p className='text-gray-500 text-xs mb-1'>Ratio R/B</p>
            {ratioRB > 0 ? (
              <>
                <p className={`text-2xl font-bold ${ratioRB >= ratioMinimo ? 'text-green-400' : 'text-red-400'}`}>1:{fmt2(ratioRB)}</p>
                <p className='text-gray-600 text-xs mt-0.5'>
                  {ratioRB >= ratioMinimo ? `✓ Cumple (mín ${ratioMinimo}:1)` : `✗ No cumple (mín ${ratioMinimo}:1)`}
                </p>
                {beneficioPrevisto > 0 && <p className='text-green-600 text-xs'>+{fmt2(beneficioPrevisto)} €</p>}
              </>
            ) : (
              <>
                <p className='text-gray-600 text-lg'>—</p>
                <p className='text-gray-700 text-xs mt-0.5'>Introduce precio objetivo</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Protocolo overnight ── */}
      {hayResultados && (
        <div className='bg-gray-900 border border-blue-900/40 rounded-xl p-4'>
          <h3 className='text-sm font-bold text-blue-300 mb-3'>🕓 Protocolo a las 16:00h</h3>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs'>
            <div className='bg-red-950/30 border border-red-900/40 rounded-lg p-3'>
              <p className='text-red-400 font-medium'>📉 Pérdida &gt; 1.5% → Cierre obligatorio</p>
            </div>
            <div className='bg-yellow-950/30 border border-yellow-900/40 rounded-lg p-3'>
              <p className='text-yellow-400 font-medium'>📊 Ganancia &lt; 1% con macro caliente → Cierre</p>
            </div>
            <div className='bg-blue-950/30 border border-blue-900/40 rounded-lg p-3'>
              <p className='text-blue-400 font-medium'>🔒 Ganancia 1–2.5% → Stop a break-even</p>
            </div>
            <div className='bg-green-950/30 border border-green-900/40 rounded-lg p-3'>
              <p className='text-green-400 font-medium'>🎯 Ganancia &gt; 2.5% → Cierre parcial 50%</p>
            </div>
          </div>
          <p className='text-gray-700 text-xs mt-2'>Excepción: señal técnica alcista + macro favorable → puede aguantar overnight.</p>
        </div>
      )}

      {/* ── Checklist filtro ── */}
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-4'>
        <h3 className='text-sm font-bold text-gray-300 mb-3'>✅ Filtro obligatorio antes de entrar</h3>
        <div className='flex flex-col gap-2 text-sm text-gray-400'>
          <p>1. ¿El activo está en tendencia clara (SMA50 &gt; SMA200)?</p>
          <p>2. ¿El RSI no está en sobrecompra (&gt;70)?</p>
          <p>3. ¿El volumen acompaña el movimiento?</p>
          <p>4. ¿El stop está en zona técnica relevante (soporte, mínimo previo)?</p>
          <div className='border-t border-gray-800 pt-2 mt-1'>
            <p className='text-gray-300 font-medium mb-2'>
              5. ¿El contexto macro es favorable <span className='text-yellow-400'>para este sector concreto</span>?
            </p>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-gray-500 pl-3'>
              <p>
                🛢️ <span className='text-gray-400'>Petróleo alto</span> → favorable energía, desfavorable aerolíneas/consumo
              </p>
              <p>
                ⚔️ <span className='text-gray-400'>Guerra activa</span> → favorable defensa/utilities, desfavorable lujo/turismo
              </p>
              <p>
                📈 <span className='text-gray-400'>Inflación alta</span> → favorable bancos/materias primas, desfavorable tech
              </p>
              <p>
                🏦 <span className='text-gray-400'>Tipos altos</span> → favorable bancos, desfavorable inmobiliario
              </p>
            </div>
          </div>
          <p className='text-gray-600 text-xs mt-2 border-t border-gray-800 pt-2'>
            💡 Máx. 1 posición simultánea. Excepción: 2 posiciones si ambas pasan el filtro y son sectores no correlacionados.
          </p>
        </div>
      </div>
    </div>
  )
}
