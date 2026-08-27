import { describe, expect, it, vi } from 'vitest'
import { FileService } from '../src/modules/files/file-service.js'
import type { Repositories } from '../src/database/repositories.js'
import type { User } from '../src/domain/types.js'
import { UserService } from '../src/modules/users/user-service.js'
import { HistoryService } from '../src/modules/history/history-service.js'
import { localDateOf } from '../src/shared/time.js'

const user: User = {
  id: 'user', name: 'Ana', email: 'ana@example.com', passwordHash: 'hash', role: 'ADMIN', managerId: null, managerName: null,
  createdById: null, workStartDate: '2026-07-01', dailyWorkloadMinutes: 480, standardEntryTime: '08:00', standardExitTime: '17:00',
  lunchEnabled: false, lunchDurationMinutes: 0, workDays: ['MONDAY'], hourBankMinutes: 0,
  workedDayTotals: { total: 0, inSchedule: 0, outsideSchedule: 0 }, createdAt: new Date(), updatedAt: new Date(),
}
const historyData = { startDate: '2026-07-13', endDate: '2026-07-13', totalWorkedMinutes: 480, totalBalanceMinutes: 0, hourBankMinutes: 30,
  pagination: { limit: 90, offset: 0, total: 1 }, days: [{ date: '2026-07-13', firstEntryAt: '2026-07-13T11:00:00.000Z', lastExitAt: '2026-07-13T20:00:00.000Z', workedMinutes: 480, pausedMinutes: 0, balanceMinutes: 0, isComplete: true, workLogs: [] }] }
function service(methods: Record<string, unknown> = {}) {
  const repositories = { findUserByEmail: vi.fn().mockResolvedValue(user), importClosedWorkLogs: vi.fn().mockResolvedValue(new Map()), ...methods } as unknown as Repositories
  const users = { canAccess: vi.fn().mockResolvedValue(true) } as unknown as UserService
  const history = { get: vi.fn().mockResolvedValue(historyData) } as unknown as HistoryService
  return { files: new FileService(repositories, users, history, 'America/Sao_Paulo'), repositories, users, history }
}

describe('FileService', () => {
  it('generates CSV and XLSX templates', async () => {
    const files = service().files
    expect(files.csvTemplate().toString()).toContain('user@empresa.com,14/07/2026,08:30,12:00,PAUSE')
    const template = await files.xlsxTemplate()
    expect(template.subarray(0, 2)).toEqual(Buffer.from('PK'))

    const { files: importer, repositories } = service()
    await expect(importer.importFile(user, 'records.xlsx', template)).resolves.toMatchObject({ importedCount: 2, errorCount: 0 })
    expect(repositories.importClosedWorkLogs).toHaveBeenCalledWith([
      expect.objectContaining({ entryAt: new Date('2026-07-14T11:30:00.000Z'), exitAt: new Date('2026-07-14T15:00:00.000Z') }),
      expect.objectContaining({ entryAt: new Date('2026-07-14T16:00:00.000Z'), exitAt: new Date('2026-07-14T20:20:00.000Z') }),
    ])
  })

  it('imports valid CSV rows and returns per-row errors without discarding valid data', async () => {
    const importClosedWorkLogs = vi.fn().mockResolvedValue(new Map([[3, 'Overlapping work log already exists for this period']]))
    const { files } = service({ findUserByEmail: vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(null), importClosedWorkLogs })
    const result = await files.importFile(user, 'records.csv', Buffer.from(
      'email,date,entry_at,exit_at,close_reason\nana@example.com,13/07/2026,08:00,17:00,EXIT\nmissing@example.com,14/07/2026,08:00,17:00,EXIT\n',
    ))
    expect(result).toEqual(expect.objectContaining({ importedCount: 0, errorCount: 2 }))
    expect(importClosedWorkLogs).toHaveBeenCalledWith([expect.objectContaining({ userId: user.id, closeReason: 'EXIT' })])
  })

  it('imports Brazilian dates and 24-hour times as Sao Paulo instants, including shortly after midnight', async () => {
    const { files, repositories } = service()
    await files.importFile(user, 'records.csv', Buffer.from(
      'email,date,entry_at,exit_at,close_reason\nana@example.com,14/07/2026,00:30,01:30,EXIT\n',
    ))
    const [row] = (repositories.importClosedWorkLogs as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(row.entryAt.toISOString()).toBe('2026-07-14T03:30:00.000Z')
    expect(row.exitAt.toISOString()).toBe('2026-07-14T04:30:00.000Z')
    expect(localDateOf(row.entryAt, 'America/Sao_Paulo')).toBe('2026-07-14')
  })

  it.each([
    ['2026-07-14', '13:00', '17:00', 'date must follow format DD/MM/YYYY'],
    ['31/02/2026', '13:00', '17:00', 'must be a valid date and time'],
    ['14/07/2026', '24:00', '17:00', 'must be a valid date and time'],
    ['14/07/2026', '01:00 PM', '17:00', 'must follow format HH:mm (24-hour)'],
    ['14/07/2026', '13:00:30', '17:00', 'must follow format HH:mm (24-hour)'],
  ])('rejects invalid Brazilian date or 24-hour time %s %s', async (date, entryAt, exitAt, message) => {
    const { files } = service()
    const result = await files.importFile(user, 'records.csv', Buffer.from(
      `email,date,entry_at,exit_at,close_reason\nana@example.com,${date},${entryAt},${exitAt},EXIT\n`,
    )) as { importedCount: number; errorCount: number; errors: Array<{ message: string }> }
    expect(result).toMatchObject({ importedCount: 0, errorCount: 1 })
    expect(result.errors[0]?.message).toContain(message)
  })

  it.each([
    ['', 'records.csv', 'File is required'],
    ['data', 'records.txt', 'Unsupported file type'],
    ['data', 'records.xlsx', 'Invalid XLSX file content'],
    ['PK', 'records.csv', 'Invalid CSV file content'],
    ['wrong,header\n', 'records.csv', 'Invalid header'],
  ])('rejects invalid import %s', async (content, filename, message) => {
    await expect(service().files.importFile(user, filename, Buffer.from(content))).rejects.toMatchObject({ message: expect.stringContaining(message) })
  })

  it('returns a clear validation message when an XLSX cannot be read', async () => {
    await expect(service().files.importFile(user, 'corrupted.xlsx', Buffer.from('PK'))).rejects.toMatchObject({
      message: 'Unable to read the XLSX file. Check that it is not corrupted or password-protected, then try again.',
      statusCode: 400,
    })
  })

  it('exports history as Excel and PDF', async () => {
    const { files, history } = service()
    const excel = await files.exportExcel(user, '2026-07-13', '2026-07-13')
    expect(excel.subarray(0, 2)).toEqual(Buffer.from('PK'))
    const pdf = await files.exportPdf(user, '2026-07-13', '2026-07-13')
    const chunks: Buffer[] = []
    for await (const chunk of pdf) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).subarray(0, 4).toString()).toBe('%PDF')
    expect(history.get).toHaveBeenCalledTimes(2)
  })
})
