import styles from './Pagination.module.css'

interface PaginationData { limit: number; offset: number; total: number }

interface PaginationProps {
  pagination?: PaginationData
  onPageChange: (offset: number) => void
  disabled?: boolean
}

function Pagination({ pagination, onPageChange, disabled = false }: PaginationProps) {
  if (!pagination || pagination.total <= pagination.limit) return null

  const page = Math.floor(pagination.offset / pagination.limit) + 1
  const totalPages = Math.ceil(pagination.total / pagination.limit)
  const hasPrevious = pagination.offset > 0
  const hasNext = pagination.offset + pagination.limit < pagination.total

  return (
    <nav className={styles.pagination} aria-label="Paginação">
      <span>Página {page} de {totalPages}</span>
      <div className={styles.actions}>
        <button type="button" disabled={disabled || !hasPrevious} onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}>Anterior</button>
        <button type="button" disabled={disabled || !hasNext} onClick={() => onPageChange(pagination.offset + pagination.limit)}>Próxima</button>
      </div>
    </nav>
  )
}

export default Pagination
