// Barra de filtros del histórico
export default function FiltrosHistorico({
  filtroBusqueda,
  setFiltroBusqueda,
  filtroAnio,
  setFiltroAnio,
  filtroEstado,
  setFiltroEstado,
  filtroResultado,
  setFiltroResultado,
  aniosDisponibles,
  totalFiltradas,
  totalTotal,
  onLimpiar
}) {
  const hayFiltros = filtroBusqueda || filtroAnio || filtroEstado || filtroResultado
  const selectFiltro = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-blue-500'

  return (
    <div
      className='bg-gray-900 border border-gray-800 rounded-xl p-4
                    flex flex-wrap gap-3 items-end'
    >
      {/* Búsqueda por ticker */}
      <div className='flex flex-col gap-1 flex-1 min-w-32'>
        <label className='text-gray-500 text-xs'>Ticker</label>
        <input
          type='text'
          placeholder='SAN, PEP...'
          value={filtroBusqueda}
          onChange={e => setFiltroBusqueda(e.target.value)}
          className='bg-gray-800 border border-gray-700 rounded-lg px-3 py-2
                     text-sm text-gray-300 outline-none focus:border-blue-500 w-full'
        />
      </div>

      {/* Año fiscal */}
      <div className='flex flex-col gap-1'>
        <label className='text-gray-500 text-xs'>Año fiscal</label>
        <select
          value={filtroAnio}
          onChange={e => setFiltroAnio(e.target.value)}
          className={selectFiltro}
        >
          <option value=''>Todos</option>
          {aniosDisponibles.map(a => (
            <option
              key={a}
              value={a}
            >
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Estado */}
      <div className='flex flex-col gap-1'>
        <label className='text-gray-500 text-xs'>Estado</label>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className={selectFiltro}
        >
          <option value=''>Todos</option>
          <option value='ABIERTA'>Abiertas</option>
          <option value='CERRADA'>Cerradas</option>
        </select>
      </div>

      {/* Resultado */}
      <div className='flex flex-col gap-1'>
        <label className='text-gray-500 text-xs'>Resultado</label>
        <select
          value={filtroResultado}
          onChange={e => setFiltroResultado(e.target.value)}
          className={selectFiltro}
        >
          <option value=''>Todos</option>
          <option value='GANADORA'>Ganadoras</option>
          <option value='PERDEDORA'>Perdedoras</option>
        </select>
      </div>

      {/* Limpiar */}
      {hayFiltros && (
        <button
          onClick={onLimpiar}
          className='text-gray-500 hover:text-gray-300 text-sm px-3 py-2
                     border border-gray-700 rounded-lg transition-colors'
        >
          ✕ Limpiar
        </button>
      )}

      {/* Contador */}
      <span className='text-gray-600 text-xs self-end pb-2 ml-auto'>
        {totalFiltradas} de {totalTotal} operaciones
      </span>
    </div>
  )
}
