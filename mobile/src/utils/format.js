export const formatWorkload = (minutes) => minutes == null ? '—' : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
export const formatSignedDuration = (minutes) => minutes == null ? '—' : `${minutes > 0 ? '+' : minutes < 0 ? '-' : ''}${formatWorkload(Math.abs(minutes))}`
export const formatTime = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
export const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—'
export const currentMonthRange = () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); const iso = (date) => date.toISOString().slice(0, 10); return { startDate: iso(first), endDate: iso(last) } }
