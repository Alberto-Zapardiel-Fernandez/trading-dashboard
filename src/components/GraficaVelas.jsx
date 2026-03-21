// src/components/GraficaVelas.jsx
import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts'
import { calcularSMA, calcularRSI, calcularMACD } from '../services/indicadores'

const TEMA = {
  fondo: '#0d1117',
  texto: '#9ca3af',
  rejilla: '#1f2937',
  borde: '#374151',
  verde: '#4ade80',
  rojo: '#f87171',
  amarillo: '#facc15',
  azul: '#60a5fa',
  morado: '#a78bfa'
}

const SEGUNDOS_VISIBLES = {
  '1m': 1 * 24 * 60 * 60,
  '15m': 5 * 24 * 60 * 60,
  '1h': 30 * 24 * 60 * 60,
  '4h': 90 * 24 * 60 * 60,
  '1D': 365 * 24 * 60 * 60,
  '1S': 365 * 2 * 24 * 60 * 60,
  '1M': 365 * 5 * 24 * 60 * 60
}

// Alturas fijas de cada panel (deben sumar el height total del chart)
const ALTURA_VELAS = 360
const ALTURA_VOLUMEN = 100
const ALTURA_RSI = 130
const ALTURA_MACD = 130
const ALTURA_TOTAL = ALTURA_VELAS + ALTURA_VOLUMEN + ALTURA_RSI + ALTURA_MACD // 720

// Posición top de cada etiqueta (acumulando alturas de paneles anteriores)
const LABEL_TOP = {
  velas: ALTURA_VELAS - 24, // dentro del panel velas, abajo
  volumen: ALTURA_VELAS + 4, // inicio panel volumen
  rsi: ALTURA_VELAS + ALTURA_VOLUMEN + 4, // inicio panel RSI
  macd: ALTURA_VELAS + ALTURA_VOLUMEN + ALTURA_RSI + 4 // inicio panel MACD
}

// Etiqueta flotante sobre el chart
function PanelLabel({ top, texto, color = '#6b7280' }) {
  return (
    <div
      style={{ top, left: 8, position: 'absolute', zIndex: 10, pointerEvents: 'none' }}
      className='flex items-center gap-1.5'
    >
      <span style={{ color, fontSize: 16, fontWeight: 1000, letterSpacing: '0.1em', textShadow: '0 1px 3px #0d1117' }}>{texto}</span>
    </div>
  )
}

export default function GraficaVelas({ velas, cargando, error, temporalidad = '1D' }) {
  const refChart = useRef(null)
  const chart = useRef(null)

  useEffect(() => {
    if (!velas || velas.length === 0) return

    chart.current = createChart(refChart.current, {
      layout: {
        background: { type: ColorType.Solid, color: TEMA.fondo },
        textColor: TEMA.texto
      },
      grid: {
        vertLines: { color: TEMA.rejilla },
        horzLines: { color: TEMA.rejilla }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: TEMA.borde },
      timeScale: { borderColor: TEMA.borde, timeVisible: true, rightOffset: 5 },
      autoSize: true,
      height: ALTURA_TOTAL
    })

    // Ajustamos las alturas de cada panel tras crear el chart
    const panes = chart.current.panes()
    if (panes[0]) panes[0].setHeight(ALTURA_VELAS)
    if (panes[1]) panes[1].setHeight(ALTURA_VOLUMEN)
    if (panes[2]) panes[2].setHeight(ALTURA_RSI)
    if (panes[3]) panes[3].setHeight(ALTURA_MACD)

    // ── Pane 0: Velas + SMA50 + SMA200 ───────────────────────────────────────
    const serieVelas = chart.current.addSeries(
      CandlestickSeries,
      {
        upColor: TEMA.verde,
        downColor: TEMA.rojo,
        borderUpColor: TEMA.verde,
        borderDownColor: TEMA.rojo,
        wickUpColor: TEMA.verde,
        wickDownColor: TEMA.rojo
      },
      0
    )
    serieVelas.setData(velas)

    const sma50 = calcularSMA(velas, 50)
    if (sma50.length > 0) {
      const s = chart.current.addSeries(
        LineSeries,
        {
          color: TEMA.amarillo,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'SMA50'
        },
        0
      )
      s.setData(sma50)
    }

    const sma200 = calcularSMA(velas, 200)
    if (sma200.length > 0) {
      const s = chart.current.addSeries(
        LineSeries,
        {
          color: TEMA.azul,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'SMA200'
        },
        0
      )
      s.setData(sma200)
    }

    // ── Pane 1: Volumen ───────────────────────────────────────────────────────
    const serieVol = chart.current.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        title: 'Vol',
        lastValueVisible: true
      },
      1
    )
    serieVol.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } })
    serieVol.setData(
      velas.map(v => ({
        time: v.time,
        value: v.volume,
        color: v.close >= v.open ? TEMA.verde + '88' : TEMA.rojo + '88'
      }))
    )

    // ── Pane 2: RSI ───────────────────────────────────────────────────────────
    const rsi = calcularRSI(velas, 14)
    if (rsi.length > 0) {
      const serieRsi = chart.current.addSeries(
        LineSeries,
        {
          color: TEMA.morado,
          lineWidth: 1,
          priceLineVisible: false,
          title: 'RSI(14)',
          lastValueVisible: true,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 }
          })
        },
        2
      )
      serieRsi.setData(rsi)
      serieRsi.createPriceLine({ price: 70, color: TEMA.rojo, lineWidth: 1, lineStyle: 2, title: '70' })
      serieRsi.createPriceLine({ price: 50, color: TEMA.borde, lineWidth: 1, lineStyle: 3, title: '' })
      serieRsi.createPriceLine({ price: 30, color: TEMA.verde, lineWidth: 1, lineStyle: 2, title: '30' })
    }

    // ── Pane 3: MACD ──────────────────────────────────────────────────────────
    const { macd, signal, histograma } = calcularMACD(velas)
    if (macd.length > 0) {
      const serieHisto = chart.current.addSeries(
        HistogramSeries,
        {
          priceLineVisible: false,
          title: '',
          lastValueVisible: true
        },
        3
      )
      serieHisto.setData(
        histograma.map(h => ({
          time: h.time,
          value: h.value,
          color: h.value >= 0 ? TEMA.verde + '88' : TEMA.rojo + '88'
        }))
      )

      const serieMacd = chart.current.addSeries(
        LineSeries,
        {
          color: TEMA.azul,
          lineWidth: 1,
          priceLineVisible: false,
          title: 'MACD',
          lastValueVisible: true
        },
        3
      )
      serieMacd.setData(macd)

      const serieSignal = chart.current.addSeries(
        LineSeries,
        {
          color: TEMA.amarillo,
          lineWidth: 1,
          priceLineVisible: false,
          title: 'Señal',
          lastValueVisible: true
        },
        3
      )
      serieSignal.setData(signal)
    }

    // ── Zoom inicial ──────────────────────────────────────────────────────────
    const ultimaVela = velas[velas.length - 1].time
    const segundosAtras = SEGUNDOS_VISIBLES[temporalidad] || SEGUNDOS_VISIBLES['1D']
    chart.current.timeScale().setVisibleRange({
      from: ultimaVela - segundosAtras,
      to: ultimaVela + 86400
    })

    return () => chart.current?.remove()
  }, [velas, temporalidad])

  if (cargando) {
    return (
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-8 text-center'>
        <p className='text-gray-400'>Cargando datos...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-8 text-center'>
        <p className='text-red-400'>{error}</p>
      </div>
    )
  }

  if (!velas || velas.length === 0) {
    return (
      <div className='bg-gray-900 border border-gray-800 rounded-xl p-12 text-center'>
        <p className='text-gray-600 text-lg'>Busca un ticker para ver el análisis técnico</p>
        <p className='text-gray-700 text-sm mt-1'>Ejemplos: SAN.MC · PEP · VUSA.DE · AAPL</p>
      </div>
    )
  }

  return (
    <div className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
      {/* Contenedor relativo para poder poner etiquetas encima del chart */}
      <div style={{ position: 'relative' }}>
        <div ref={refChart} />

        {/* Etiquetas de cada panel */}
        <PanelLabel
          top={LABEL_TOP.volumen}
          texto='VOLUMEN'
          color={TEMA.texto}
        />
        <PanelLabel
          top={LABEL_TOP.rsi}
          texto='RSI (14)'
          color={TEMA.morado}
        />
        <PanelLabel
          top={LABEL_TOP.macd}
          texto='MACD (12, 26, 9)'
          color={TEMA.azul}
        />
      </div>
    </div>
  )
}
