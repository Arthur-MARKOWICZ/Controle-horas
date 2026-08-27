import { describe, expect, it } from 'vitest'
import type { CloseReason, WorkLog } from '../src/domain/types.js'
import { closedMinutesByDate, isDayComplete, localDateOf, pausedMinutes } from '../src/shared/time.js'
import { WorkTimeService } from '../src/modules/work-logs/work-time-service.js'

const zone = 'America/Sao_Paulo'
const service = new WorkTimeService(zone)
let sequence = 0
function log(entry: string, exit: string | null, reason: CloseReason | null = exit ? 'EXIT' : null): WorkLog {
  sequence += 1
  return {
    id: String(sequence), userId: 'user', entryAt: new Date(entry), exitAt: exit ? new Date(exit) : null,
    closeReason: reason, createdAt: new Date(entry), updatedAt: new Date(exit || entry),
  }
}

describe('WorkTimeService characterization', () => {
  it('uses the first entry to calculate expected exit', () => {
    const logs = [log('2026-07-14T11:30:00Z', '2026-07-14T15:00:00Z', 'PAUSE')]
    expect(service.expectedExit(logs, '2026-07-14', 530, ['TUESDAY'], false, 0)?.toISOString()).toBe('2026-07-14T20:20:00.000Z')
  })
  it('extends expected exit by completed pauses', () => {
    const logs = [
      log('2026-07-14T11:30:00Z', '2026-07-14T15:00:00Z', 'PAUSE'),
      log('2026-07-14T15:30:00Z', null),
    ]
    expect(service.expectedExit(logs, '2026-07-14', 530, ['TUESDAY'], false, 0)?.toISOString()).toBe('2026-07-14T20:50:00.000Z')
  })
  it('returns null expected exit without entry', () => expect(service.expectedExit([], '2026-07-14', 530, ['TUESDAY'], false, 0)).toBeNull())
  it('uses zero workload on non-work day', () => {
    const logs = [log('2026-07-18T11:30:00Z', null)]
    expect(service.expectedExit(logs, '2026-07-18', 530, ['MONDAY'], false, 0)?.toISOString()).toBe('2026-07-18T11:30:00.000Z')
  })
  it('sums multiple closed pairs', () => {
    const logs = [log('2026-07-14T11:00:00Z', '2026-07-14T15:00:00Z'), log('2026-07-14T16:00:00Z', '2026-07-14T20:00:00Z')]
    expect(service.workedMinutesOnDate(logs, '2026-07-14')).toBe(480)
  })
  it.each([[530, 530, 0], [600, 530, 70], [400, 530, -130]])('supports balance arithmetic', (worked, workload, balance) => {
    expect(worked - workload).toBe(balance)
  })
  it('counts Saturday work as positive', () => expect(120 - 0).toBe(120))
  it('includes planned lunch before lunch is registered', () => {
    const logs = [log('2026-07-14T11:30:00Z', null)]
    expect(service.expectedExit(logs, '2026-07-14', 470, ['TUESDAY'], true, 60)?.toISOString()).toBe('2026-07-14T20:20:00.000Z')
  })
  it('does not double count registered lunch', () => {
    const logs = [
      log('2026-07-14T11:30:00Z', '2026-07-14T15:00:00Z', 'LUNCH'),
      log('2026-07-14T16:00:00Z', null),
    ]
    expect(service.expectedExit(logs, '2026-07-14', 470, ['TUESDAY'], true, 60)?.toISOString()).toBe('2026-07-14T20:20:00.000Z')
  })
  it('includes an open session in worked minutes', () => {
    expect(service.workedMinutesIncludingOpen([log('2026-07-14T11:00:00Z', null)], new Date('2026-07-14T12:30:00Z'))).toBe(90)
    expect(service.workedMinutesOnDateIncludingOpen(
      [log('2026-07-15T02:30:00Z', null)], '2026-07-15', new Date('2026-07-15T03:30:00Z'),
    )).toBe(30)
  })
  it('splits a closed interval at local midnight', () => {
    const values = closedMinutesByDate([log('2026-07-15T02:00:00Z', '2026-07-15T04:00:00Z')], zone)
    expect(values.get('2026-07-14')).toBe(60); expect(values.get('2026-07-15')).toBe(60)
  })
  it('does not add an open current journey to hour bank', () => {
    expect(service.hourBank([log('2026-07-14T11:00:00Z', null)], 530, ['TUESDAY'], '2026-07-14', '2026-07-14')).toBe(0)
  })
  it('includes a past day ending in pause', () => {
    const logs = [log('2026-07-13T11:00:00Z', '2026-07-13T12:00:00Z', 'PAUSE')]
    expect(service.hourBank(logs, 530, ['MONDAY'], '2026-07-13', '2026-07-14')).toBe(-470)
  })
  it('accumulates closed balances', () => {
    const logs = [
      log('2026-07-13T11:00:00Z', '2026-07-13T20:00:00Z'),
      log('2026-07-14T11:00:00Z', '2026-07-14T20:00:00Z'),
    ]
    expect(service.hourBank(logs, 530, ['MONDAY', 'TUESDAY'], '2026-07-13', '2026-07-14')).toBe(20)
  })
  it('debits a past work day without logs', () => expect(service.hourBank([], 530, ['MONDAY'], '2026-07-13', '2026-07-14')).toBe(-530))
  it('does not debit days before the configured absence start', () => {
    expect(service.hourBank([], 480, ['MONDAY', 'TUESDAY'], '2026-07-13', '2026-07-15', '2026-07-15')).toBe(0)
  })
  it('counts imported work before the configured absence start against the daily workload', () => {
    const imported = [log('2026-07-13T11:00:00Z', '2026-07-13T20:00:00Z')]
    expect(service.hourBank(imported, 480, ['MONDAY'], '2026-07-13', '2026-07-14', '2026-07-14')).toBe(60)
  })
  it('does not debit today without logs', () => expect(service.hourBank([], 530, ['TUESDAY'], '2026-07-14', '2026-07-14')).toBe(0))
  it('adds non-work-day effort', () => {
    const logs = [log('2026-07-18T11:00:00Z', '2026-07-18T13:00:00Z')]
    expect(service.hourBank(logs, 530, ['MONDAY'], '2026-07-18', '2026-07-18')).toBe(120)
  })
  it('counts lunch gaps as paused minutes', () => {
    const logs = [log('2026-07-14T11:00:00Z', '2026-07-14T15:00:00Z', 'LUNCH'), log('2026-07-14T16:00:00Z', null)]
    expect(pausedMinutes(logs)).toBe(60)
  })
  it('recognizes temporary close as incomplete', () => expect(isDayComplete([log('2026-07-14T11:00:00Z', '2026-07-14T12:00:00Z', 'LUNCH')])).toBe(false))
  it('attributes spillover minutes to the next date', () => {
    const logs = [log('2026-07-15T02:30:00Z', '2026-07-15T03:30:00Z')]
    expect(service.hourBank(logs, 0, [], '2026-07-14', '2026-07-15')).toBe(60)
  })
  it('respects configured work days', () => {
    expect(service.hourBank([], 60, ['MONDAY'], '2026-07-13', '2026-07-14')).toBe(-60)
  })
  it('uses America/Sao_Paulo display date', () => expect(localDateOf(new Date('2026-07-15T01:00:00Z'), zone)).toBe('2026-07-14'))
})
