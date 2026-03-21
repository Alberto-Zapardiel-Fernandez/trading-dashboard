// ============================================================
// exportUtils.js — Utilidades de exportación de datos
// Soporta CSV (nativo) y Excel (.xlsx con SheetJS)
// ============================================================

import * as XLSX from 'xlsx'

// ------------------------------------------------------------
// UTILIDAD INTERNA: Fecha de hoy en formato YYYY-MM-DD
// ------------------------------------------------------------
const fechaHoy = () => new Date().toISOString().split('T')[0]

// ------------------------------------------------------------
// UTILIDAD INTERNA: Dispara la descarga de un Blob en el navegador
// ------------------------------------------------------------
const descargarFichero = (blob, nombreFichero) => {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreFichero
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url) // liberar memoria
}

// ============================================================
// EXPORTAR OPERACIONES A CSV
// Acepta el array completo o ya filtrado (lo que se muestra en pantalla)
// ============================================================
export const exportarOperacionesCSV = operaciones => {
  if (!operaciones || operaciones.length === 0) {
    alert('No hay operaciones para exportar.')
    return
  }

  const cabecera = [
    'Ticker',
    'Moneda',
    'Estado',
    'Fecha Apertura',
    'Fecha Cierre',
    'Precio Entrada',
    'Precio Cierre',
    'Nº Acciones',
    'Inversión (€)',
    'P&L (€)',
    'P&L (%)',
    'FX Compra',
    'Notas'
  ]

  const filas = operaciones.map(op => {
    // Calcular porcentaje igual que en pantalla: pnlEuros / inversion * 100
    const pct = op.inversion > 0 ? (((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2) : ''

    return [
      op.ticker ?? '',
      op.moneda ?? '',
      op.estado ?? '',
      op.fechaApertura ?? '',
      op.fechaCierre ?? '',
      op.precioEntrada ?? '',
      op.precioCierre ?? '',
      op.numAcciones ?? '',
      op.inversion ?? '',
      op.pnlEuros ?? '',
      pct,
      op.fxCompra ?? '',
      op.notas ?? ''
    ]
  })

  // Separador ";" para que Excel en español lo abra directamente
  const contenido = [cabecera, ...filas].map(fila => fila.map(celda => `"${String(celda).replace(/"/g, '""')}"`).join(';')).join('\n')

  // BOM UTF-8 → tildes y ñ correctas en Excel Windows
  const blob = new Blob(['\uFEFF' + contenido], {
    type: 'text/csv;charset=utf-8;'
  })

  descargarFichero(blob, `operaciones_${fechaHoy()}.csv`)
}

// ============================================================
// EXPORTAR OPERACIONES A EXCEL (.xlsx)
// Los números quedan como números — se pueden sumar en Excel
// ============================================================
export const exportarOperacionesExcel = operaciones => {
  if (!operaciones || operaciones.length === 0) {
    alert('No hay operaciones para exportar.')
    return
  }

  const datos = operaciones.map(op => {
    const pct = op.inversion > 0 ? parseFloat((((op.pnlEuros || 0) / op.inversion) * 100).toFixed(2)) : 0

    return {
      'Ticker': op.ticker ?? '',
      'Moneda': op.moneda ?? '',
      'Estado': op.estado ?? '',
      'Fecha Apertura': op.fechaApertura ?? '',
      'Fecha Cierre': op.fechaCierre ?? '',
      'Precio Entrada': Number(op.precioEntrada) || 0,
      'Precio Cierre': Number(op.precioCierre) || 0,
      'Nº Acciones': Number(op.numAcciones) || 0,
      'Inversión (€)': Number(op.inversion) || 0,
      'P&L (€)': Number(op.pnlEuros) || 0,
      'P&L (%)': pct,
      'FX Compra': Number(op.fxCompra) || 1,
      'Notas': op.notas ?? ''
    }
  })

  // Crear hoja y libro
  const hoja = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Operaciones')

  // Ajustar ancho de columnas al contenido
  const anchos = Object.keys(datos[0]).map(clave => ({
    wch: Math.max(clave.length, ...datos.map(fila => String(fila[clave]).length)) + 2
  }))
  hoja['!cols'] = anchos

  const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })

  descargarFichero(blob, `operaciones_${fechaHoy()}.xlsx`)
}

// ============================================================
// EXPORTAR MOVIMIENTOS (LIBRO DE CAJA) A CSV
// ============================================================
export const exportarMovimientosCSV = movimientos => {
  if (!movimientos || movimientos.length === 0) {
    alert('No hay movimientos para exportar.')
    return
  }

  const cabecera = ['Fecha', 'Tipo', 'Importe (€)', 'Descripción']

  const filas = movimientos.map(mov => [mov.fecha ?? '', mov.tipo ?? '', mov.importe ?? '', mov.descripcion ?? ''])

  const contenido = [cabecera, ...filas].map(fila => fila.map(celda => `"${String(celda).replace(/"/g, '""')}"`).join(';')).join('\n')

  const blob = new Blob(['\uFEFF' + contenido], {
    type: 'text/csv;charset=utf-8;'
  })

  descargarFichero(blob, `movimientos_${fechaHoy()}.csv`)
}

// ============================================================
// EXPORTAR MOVIMIENTOS A EXCEL (.xlsx)
// ============================================================
export const exportarMovimientosExcel = movimientos => {
  if (!movimientos || movimientos.length === 0) {
    alert('No hay movimientos para exportar.')
    return
  }

  const datos = movimientos.map(mov => ({
    'Fecha': mov.fecha ?? '',
    'Tipo': mov.tipo ?? '',
    'Importe (€)': Number(mov.importe) || 0,
    'Descripción': mov.descripcion ?? ''
  }))

  const hoja = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos')

  const anchos = Object.keys(datos[0]).map(clave => ({
    wch: Math.max(clave.length, ...datos.map(fila => String(fila[clave]).length)) + 2
  }))
  hoja['!cols'] = anchos

  const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })

  descargarFichero(blob, `movimientos_${fechaHoy()}.xlsx`)
}
