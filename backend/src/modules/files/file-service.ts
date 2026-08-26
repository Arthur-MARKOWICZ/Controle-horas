import type { Repositories, ImportedWorkLog } from '../../database/repositories.js'
import type { Readable } from 'node:stream'
import type { CloseReason, User } from '../../domain/types.js'
import { CLOSE_REASONS } from '../../domain/types.js'
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js'
import type { HistoryService } from '../history/history-service.js'
import type { UserService } from '../users/user-service.js'

interface RawImportRow { rowNumber: number; email: string; entryAt: unknown; exitAt: unknown; closeReason: string }
interface ImportError { row: number; message: string }

const TEMPLATE_ROWS = [
  ['email', 'entry_at', 'exit_at', 'close_reason'],
  ['user@empresa.com', '2026-07-14T08:30:00-03:00', '2026-07-14T12:00:00-03:00', 'PAUSE'],
  ['user@empresa.com', '2026-07-14T13:00:00-03:00', '2026-07-14T17:20:00-03:00', 'EXIT'],
]

function duration(totalMinutes: number, signed = false): string {
  const sign = signed ? (totalMinutes > 0 ? '+' : totalMinutes < 0 ? '-' : '') : ''
  const absolute = Math.abs(totalMinutes)
  return `${sign}${Math.floor(absolute / 60)}h ${(absolute % 60).toString().padStart(2, '0')}m`
}

function excelText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function localDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function localInstant(value: string | null, timeZone: string): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export class FileService {
  constructor(
    private readonly repositories: Repositories,
    private readonly users: UserService,
    private readonly history: HistoryService,
    private readonly timeZone: string,
  ) {}

  csvTemplate(): Buffer {
    return Buffer.from(TEMPLATE_ROWS.map((row) => row.join(',')).join('\n') + '\n', 'utf8')
  }

  async xlsxTemplate(): Promise<Buffer> {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('work_logs')
    TEMPLATE_ROWS.forEach((row) => sheet.addRow(row))
    sheet.columns.forEach((column) => { column.width = 32 })
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }

  async importFile(actor: User, filename: string, content: Buffer): Promise<object> {
    if (!content.length) throw new ValidationError('File is required')
    if (content.length > 2 * 1024 * 1024) throw new ValidationError('File exceeds maximum size of 2 MB')
    const lower = filename.toLowerCase()
    const zip = content[0] === 0x50 && content[1] === 0x4b
    if (lower.endsWith('.xlsx') && !zip) throw new ValidationError('Invalid XLSX file content')
    if (lower.endsWith('.csv') && zip) throw new ValidationError('Invalid CSV file content')
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) throw new ValidationError('Unsupported file type. Use .csv or .xlsx')
    const rawRows = lower.endsWith('.csv') ? await this.parseCsv(content) : await this.parseXlsx(content)
    if (rawRows.length > 5_000) throw new ValidationError('File exceeds maximum of 5000 data rows')

    const valid: ImportedWorkLog[] = []
    const errors: ImportError[] = []
    for (const row of rawRows) {
      try {
        const email = row.email.trim().toLowerCase()
        if (!email) throw new ValidationError('email is required')
        const target = await this.repositories.findUserByEmail(email)
        if (!target) throw new NotFoundError(`User not found for email: ${email}`)
        if (!(await this.users.canAccess(actor, target))) throw new ForbiddenError(`No permission to import records for email: ${email}`)
        const entryAt = this.parseInstant(row.entryAt, 'entry_at')
        const exitAt = this.parseInstant(row.exitAt, 'exit_at')
        if (exitAt < entryAt) throw new ValidationError('exit_at must be after or equal to entry_at')
        const reason = (row.closeReason.trim().toUpperCase() || 'EXIT') as CloseReason
        if (!CLOSE_REASONS.includes(reason)) throw new ValidationError('close_reason must be PAUSE, LUNCH or EXIT')
        valid.push({ rowNumber: row.rowNumber, userId: target.id, entryAt, exitAt, closeReason: reason })
      } catch (error) { errors.push({ row: row.rowNumber, message: error instanceof Error ? error.message : 'Invalid row' }) }
    }
    const databaseErrors = await this.repositories.importClosedWorkLogs(valid)
    for (const [row, message] of databaseErrors) errors.push({ row, message })
    errors.sort((left, right) => left.row - right.row)
    return { importedCount: valid.length - databaseErrors.size, errorCount: errors.length, errors }
  }

  async exportExcel(user: User, start: string, end: string): Promise<Buffer> {
    const ExcelJS = (await import('exceljs')).default
    const data = await this.history.get(user, start, end, 90, 0)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Historico')
    sheet.addRows([
      [excelText('Historico de horas')],
      [excelText('Usuario'), excelText(`${user.name} (${user.email})`)],
      [excelText('Periodo'), excelText(`${localDate(start)} a ${localDate(end)}`)],
      [], [excelText('Resumo')],
      [excelText('Horas trabalhadas'), excelText(duration(data.totalWorkedMinutes))],
      [excelText('Saldo do periodo'), excelText(duration(data.totalBalanceMinutes, true))],
      [excelText('Banco de horas'), excelText(duration(data.hourBankMinutes, true))],
      [], ['Data', 'Primeira entrada', 'Ultima saida', 'Horas trabalhadas', 'Saldo', 'Status'].map(excelText),
    ])
    data.days.forEach((day) => sheet.addRow([
      localDate(day.date), localInstant(day.firstEntryAt, this.timeZone), localInstant(day.lastExitAt, this.timeZone),
      duration(day.workedMinutes), duration(day.balanceMinutes, true), day.isComplete ? 'Completo' : 'Em andamento',
    ].map(excelText)))
    sheet.columns.forEach((column) => { column.width = 24 })
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }

  async exportPdf(user: User, start: string, end: string): Promise<Readable> {
    const PDFDocument = (await import('pdfkit')).default
    const data = await this.history.get(user, start, end, 90, 0)
    const document = new PDFDocument({ margin: 36, size: 'A4' })
    document.fontSize(16).text('Historico de horas')
    document.fontSize(10).text(`Usuario: ${user.name} (${user.email})`)
    document.text(`Periodo: ${localDate(start)} a ${localDate(end)}`).moveDown()
    document.fontSize(12).text('Resumo')
    document.fontSize(10).text(`Horas trabalhadas: ${duration(data.totalWorkedMinutes)}`)
    document.text(`Saldo do periodo: ${duration(data.totalBalanceMinutes, true)}`)
    document.text(`Banco de horas: ${duration(data.hourBankMinutes, true)}`).moveDown()
    document.fontSize(12).text('Dias do periodo')
    document.fontSize(8)
    for (const day of data.days) {
      document.text(
        `${localDate(day.date)} | ${localInstant(day.firstEntryAt, this.timeZone)} | `
        + `${localInstant(day.lastExitAt, this.timeZone)} | ${duration(day.workedMinutes)} | `
        + `${duration(day.balanceMinutes, true)} | ${day.isComplete ? 'Completo' : 'Em andamento'}`,
      )
    }
    document.end()
    return document
  }

  private async parseCsv(content: Buffer): Promise<RawImportRow[]> {
    const { parse } = await import('csv-parse')
    const parser = parse({ bom: true, skip_empty_lines: true, trim: true })
    parser.end(content)
    const records: unknown[][] = []
    for await (const record of parser) {
      records.push(record as unknown[])
      if (records.length > 5_001) throw new ValidationError('File exceeds maximum of 5000 data rows')
    }
    this.validateHeader(records.shift() || [])
    return records.map((row, index) => ({
      rowNumber: index + 2, email: String(row[0] || ''), entryAt: row[1], exitAt: row[2], closeReason: String(row[3] || ''),
    }))
  }

  private async parseXlsx(content: Buffer): Promise<RawImportRow[]> {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const compatibleBuffer = content as unknown as Parameters<typeof workbook.xlsx.load>[0]
    try {
      await workbook.xlsx.load(compatibleBuffer)
    } catch {
      throw new ValidationError('Unable to read the XLSX file. Check that it is not corrupted or password-protected, then try again.')
    }
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new ValidationError('XLSX file is empty')
    this.validateHeader([sheet.getCell(1, 1).text, sheet.getCell(1, 2).text, sheet.getCell(1, 3).text, sheet.getCell(1, 4).text])
    const rows: RawImportRow[] = []
    for (let number = 2; number <= sheet.rowCount; number++) {
      const row = sheet.getRow(number)
      if (!row.hasValues) continue
      rows.push({
        rowNumber: number, email: row.getCell(1).text.trim(), entryAt: row.getCell(2).value,
        exitAt: row.getCell(3).value, closeReason: row.getCell(4).text.trim(),
      })
    }
    return rows
  }

  private validateHeader(header: unknown[]): void {
    const values = header.map((value) => String(value || '').trim().toLowerCase())
    if (values[0] !== 'email' || values[1] !== 'entry_at' || values[2] !== 'exit_at') {
      throw new ValidationError('Invalid header. Expected: email,entry_at,exit_at,close_reason')
    }
  }

  private parseInstant(value: unknown, field: string): Date {
    const date = value instanceof Date ? value : new Date(String(value || '').trim())
    if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} must be a valid ISO-8601 instant`)
    return date
  }
}
