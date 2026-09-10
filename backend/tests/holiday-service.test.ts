import { describe, expect, it, vi } from 'vitest'
import type { Repositories } from '../src/database/repositories.js'
import type { User } from '../src/domain/types.js'
import { HolidayService } from '../src/modules/holidays/holiday-service.js'
import { HolidaySyncService } from '../src/modules/holidays/holiday-sync-service.js'
import type { HolidayProvider, ProvidedHoliday } from '../src/modules/holidays/nager-holiday-provider.js'
import { OrganizationResolver } from '../src/modules/holidays/organization-resolver.js'
import { UserService } from '../src/modules/users/user-service.js'
import { ExternalServiceError } from '../src/shared/errors.js'

const rootId = '00000000-0000-4000-8000-00000000000a'

function user(overrides: Partial<User> = {}): User {
  return {
    id: rootId, name: 'Root', email: 'root@example.com', passwordHash: 'hash', role: 'ADMIN',
    managerId: null, managerName: null, createdById: null, dailyWorkloadMinutes: 480,
    standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60,
    workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], workStartDate: null,
    hourBankMinutes: 0, workedDayTotals: { total: 0, inSchedule: 0, outsideSchedule: 0 },
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), ...overrides,
  }
}

const syncedAt = new Date('2026-09-10T09:00:00Z')

const nationalHoliday: ProvidedHoliday = {
  date: '2026-09-07', name: 'Independência do Brasil', externalKey: 'Independence Day',
  subdivisionCode: null, scope: 'NATIONAL',
}

function repositories(methods: Record<string, unknown> = {}): Repositories {
  return {
    findHolidayYearSyncs: vi.fn().mockResolvedValue([]),
    findResolvedHolidays: vi.fn().mockResolvedValue([]),
    findOrganizationRootId: vi.fn().mockResolvedValue(rootId),
    listManagerTeam: vi.fn().mockResolvedValue([]),
    findHolidayRules: vi.fn().mockResolvedValue([]),
    findHolidayById: vi.fn().mockResolvedValue(null),
    findHolidayRuleById: vi.fn().mockResolvedValue(null),
    upsertHolidayRules: vi.fn().mockResolvedValue([]),
    deleteHolidayRule: vi.fn().mockResolvedValue(true),
    findUserById: vi.fn().mockResolvedValue(null),
    createManualHoliday: vi.fn().mockResolvedValue(null),
    deleteManualHoliday: vi.fn().mockResolvedValue(true),
    replaceSyncedHolidayYear: vi.fn().mockResolvedValue({
      year: 2026, status: 'SUCCESS', holidayCount: 1, syncedAt,
    }),
    recordHolidaySyncFailure: vi.fn().mockResolvedValue(undefined),
    ...methods,
  } as unknown as Repositories
}

function provider(fetchYear = vi.fn().mockResolvedValue([nationalHoliday])): HolidayProvider & { fetchYear: typeof fetchYear } {
  return { fetchYear } as HolidayProvider & { fetchYear: typeof fetchYear }
}

function service(repos: Repositories, holidayProvider: HolidayProvider, now = () => 0): HolidayService {
  return new HolidayService(
    repos, new UserService(repos, 10), new OrganizationResolver(repos),
    new HolidaySyncService(repos, holidayProvider, null, now), 'BR',
  )
}

describe('HolidayService period validation', () => {
  it('rejects dates outside YYYY-MM-DD', async () => {
    await expect(service(repositories(), provider()).calendar(user(), '07/09/2026', '2026-09-30'))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an inverted period', async () => {
    await expect(service(repositories(), provider()).calendar(user(), '2026-09-30', '2026-09-01'))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a period longer than a year so a single request cannot fan out to many provider calls', async () => {
    await expect(service(repositories(), provider()).calendar(user(), '2020-01-01', '2026-12-31'))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('accepts a period of exactly the maximum length', async () => {
    await expect(service(repositories(), provider()).calendar(user(), '2026-01-01', '2026-12-31')).resolves.toBeDefined()
  })
})

describe('HolidayService calendar', () => {
  it('marks national holidays as days off', async () => {
    const repos = repositories({
      findResolvedHolidays: vi.fn().mockResolvedValue([{
        holiday: {
          id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
          date: '2026-09-07', name: 'Independência do Brasil', scope: 'NATIONAL', source: 'NAGER',
        },
        ruleId: null, ruleUserId: null, ruleDayOff: null,
      }]),
    })
    const result = await service(repos, provider()).calendar(user(), '2026-09-01', '2026-09-30')
    expect(result.days).toEqual([{
      holidayId: 'holiday-1', date: '2026-09-07', holidayDate: '2026-09-07',
      name: 'Independência do Brasil', kind: 'HOLIDAY',
      scope: 'NATIONAL', source: 'NAGER', subdivisionCode: null, dayOff: true, ruleId: null,
    }])
  })

  it('reports state holidays without making them days off', async () => {
    const repos = repositories({
      findResolvedHolidays: vi.fn().mockResolvedValue([{
        holiday: {
          id: 'holiday-2', organizationId: null, countryCode: 'BR', subdivisionCode: 'BR-SP',
          date: '2026-07-09', name: 'Revolução Constitucionalista', scope: 'SUBDIVISION', source: 'NAGER',
        },
        ruleId: null, ruleUserId: null, ruleDayOff: null,
      }]),
    })
    const result = await service(repos, provider()).calendar(user(), '2026-07-01', '2026-07-31')
    expect(result.days[0]).toMatchObject({ scope: 'SUBDIVISION', dayOff: false })
  })
})

describe('HolidaySyncService', () => {
  it('fetches a year that was never synchronized', async () => {
    const repos = repositories()
    const holidayProvider = provider()
    await service(repos, holidayProvider).calendar(user(), '2026-09-01', '2026-09-30')
    expect(holidayProvider.fetchYear).toHaveBeenCalledWith(2026, 'BR')
  })

  it('does not fetch a year that already succeeded', async () => {
    const repos = repositories({
      findHolidayYearSyncs: vi.fn().mockResolvedValue([{ year: 2026, status: 'SUCCESS', holidayCount: 12, syncedAt }]),
    })
    const holidayProvider = provider()
    await service(repos, holidayProvider).calendar(user(), '2026-09-01', '2026-09-30')
    expect(holidayProvider.fetchYear).not.toHaveBeenCalled()
  })

  it('retries a year whose previous attempt failed', async () => {
    const repos = repositories({
      findHolidayYearSyncs: vi.fn().mockResolvedValue([{ year: 2026, status: 'FAILED', holidayCount: 0, syncedAt }]),
    })
    const holidayProvider = provider()
    await service(repos, holidayProvider).calendar(user(), '2026-09-01', '2026-09-30')
    expect(holidayProvider.fetchYear).toHaveBeenCalledTimes(1)
  })

  it('synchronizes every year a period spans', async () => {
    const repos = repositories()
    const holidayProvider = provider()
    await service(repos, holidayProvider).calendar(user(), '2025-12-01', '2026-01-31')
    expect(holidayProvider.fetchYear.mock.calls.map((call) => call[0])).toEqual([2025, 2026])
  })

  it('serves an empty calendar instead of failing when the provider is down', async () => {
    const repos = repositories({ findResolvedHolidays: vi.fn().mockResolvedValue([]) })
    const holidayProvider = provider(vi.fn().mockRejectedValue(new ExternalServiceError('provider down')))
    const result = await service(repos, holidayProvider).calendar(user(), '2026-09-01', '2026-09-30')
    expect(result.days).toEqual([])
    expect(repos.recordHolidaySyncFailure).toHaveBeenCalledWith('BR', 2026, 'provider down')
  })

  it('holds off on a failed year until the cooldown expires', async () => {
    const repos = repositories()
    const holidayProvider = provider(vi.fn().mockRejectedValue(new ExternalServiceError('provider down')))
    const holidays = service(repos, holidayProvider, () => 0)
    await holidays.calendar(user(), '2026-09-01', '2026-09-30')
    await holidays.calendar(user(), '2026-09-01', '2026-09-30')
    expect(holidayProvider.fetchYear).toHaveBeenCalledTimes(1)
  })

  it('reports provider failures to the administrator asking for a resync', async () => {
    const repos = repositories()
    const holidayProvider = provider(vi.fn().mockRejectedValue(new ExternalServiceError('provider down')))
    await expect(service(repos, holidayProvider).resync(2026)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('forces the provider call on resync even when the year already succeeded', async () => {
    const repos = repositories({
      findHolidayYearSyncs: vi.fn().mockResolvedValue([{ year: 2026, status: 'SUCCESS', holidayCount: 12, syncedAt }]),
    })
    const holidayProvider = provider()
    const result = await service(repos, holidayProvider).resync(2026)
    expect(holidayProvider.fetchYear).toHaveBeenCalledWith(2026, 'BR')
    expect(repos.replaceSyncedHolidayYear).toHaveBeenCalledWith('BR', 2026, [nationalHoliday], true)
    expect(result).toEqual({ year: 2026, countryCode: 'BR', holidayCount: 1, syncedAt: syncedAt.toISOString() })
  })

  it('rejects a year outside the supported range', async () => {
    await expect(service(repositories(), provider()).resync(1800)).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('HolidayService rules', () => {
  const managerId = '00000000-0000-4000-8000-00000000000b'
  const employeeId = '00000000-0000-4000-8000-00000000000c'
  const outsiderId = '00000000-0000-4000-8000-00000000000d'
  const admin = user()
  const manager = user({ id: managerId, name: 'Manager', role: 'MANAGER', createdById: rootId })
  const subAdmin = user({ id: employeeId, name: 'Sub Admin', role: 'ADMIN', createdById: rootId })
  const employee = user({ id: employeeId, name: 'Employee', role: 'USER', managerId, createdById: managerId })

  const holidayRow = {
    id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
    date: '2026-09-07', name: 'Independência do Brasil', scope: 'NATIONAL' as const, source: 'NAGER' as const,
  }
  const savedRule = {
    id: 'rule-1', organizationId: rootId, holidayId: 'holiday-1',
    holidayDate: '2026-09-07', holidayName: 'Independência do Brasil',
    userId: null, userName: null, dayOff: false, notes: null,
    createdById: rootId, createdByName: 'Root',
    createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
  }

  function rulesService(overrides: Record<string, unknown> = {}) {
    const repos = repositories({
      findHolidayById: vi.fn().mockResolvedValue(holidayRow),
      upsertHolidayRules: vi.fn().mockResolvedValue([savedRule]),
      findUserById: vi.fn().mockImplementation(async (id: string) => {
        if (id === employeeId) return employee
        if (id === managerId) return manager
        if (id === outsiderId) return user({ id: outsiderId, role: 'USER', managerId: null, createdById: null })
        return null
      }),
      isInCreatedSubtree: vi.fn().mockImplementation(async (root: string, target: string) => (
        root === rootId && target !== outsiderId
      )),
      findOrganizationRootId: vi.fn().mockImplementation(async (id: string) => (
        id === outsiderId ? outsiderId : rootId
      )),
      ...overrides,
    })
    return { service: service(repos, provider()), repos }
  }

  it('lets the root administrator create an organization-wide rule', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(admin, 'holiday-1', { userIds: null, dayOff: false })
    expect(repos.upsertHolidayRules).toHaveBeenCalledWith([expect.objectContaining({
      organizationId: rootId, holidayId: 'holiday-1', userId: null, dayOff: false, createdByName: 'Root',
    })])
  })

  it('refuses an organization-wide rule from a manager', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(manager, 'holiday-1', { userIds: null, dayOff: false }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses an organization-wide rule from a non-root administrator', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(subAdmin, 'holiday-1', { userIds: null, dayOff: false }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets a manager create a rule for their own team member', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(manager, 'holiday-1', { userIds: [employeeId], dayOff: false })
    expect(repos.upsertHolidayRules).toHaveBeenCalledWith([expect.objectContaining({ userId: employeeId })])
  })

  it('refuses a manager creating a rule for someone outside their team', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(manager, 'holiday-1', { userIds: [outsiderId], dayOff: false }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a rule for a user of another organization', async () => {
    const { service: holidays } = rulesService({
      isInCreatedSubtree: vi.fn().mockResolvedValue(true),
    })
    await expect(holidays.saveRule(admin, 'holiday-1', { userIds: [outsiderId], dayOff: false }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses rule management from a common user', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(employee, 'holiday-1', { userIds: [employeeId], dayOff: false }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(holidays.listRules(employee)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects an unknown holiday', async () => {
    const { service: holidays } = rulesService({ findHolidayById: vi.fn().mockResolvedValue(null) })
    await expect(holidays.saveRule(admin, 'holiday-1', { userIds: null, dayOff: false }))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects an empty target list', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(admin, 'holiday-1', { userIds: [], dayOff: false }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('writes one rule per distinct target', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(admin, 'holiday-1', { userIds: [employeeId, employeeId, managerId], dayOff: true })
    expect((repos.upsertHolidayRules as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toHaveLength(2)
  })

  it('limits a manager listing to organization rules plus their own team', async () => {
    const { service: holidays, repos } = rulesService({
      listManagerTeam: vi.fn().mockResolvedValue([employee]),
    })
    await holidays.listRules(manager)
    expect(repos.findHolidayRules).toHaveBeenCalledWith(rootId, [employeeId])
  })

  it('lets an administrator list every rule of the organization', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.listRules(admin)
    expect(repos.findHolidayRules).toHaveBeenCalledWith(rootId, null)
  })

  it('refuses deleting a rule of another organization', async () => {
    const { service: holidays } = rulesService({
      findHolidayRuleById: vi.fn().mockResolvedValue({ ...savedRule, organizationId: outsiderId }),
    })
    await expect(holidays.deleteRule(admin, 'rule-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a manager deleting an organization-wide rule', async () => {
    const { service: holidays } = rulesService({
      findHolidayRuleById: vi.fn().mockResolvedValue(savedRule),
    })
    await expect(holidays.deleteRule(manager, 'rule-1')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets a manager delete a rule about their own team member', async () => {
    const { service: holidays, repos } = rulesService({
      findHolidayRuleById: vi.fn().mockResolvedValue({ ...savedRule, userId: employeeId }),
    })
    await holidays.deleteRule(manager, 'rule-1')
    expect(repos.deleteHolidayRule).toHaveBeenCalledWith('rule-1', rootId)
  })
})

describe('HolidayService rule date validation', () => {
  const rootAdmin = user()
  const holidayRow = {
    id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
    date: '2026-09-07', name: 'Independência do Brasil', scope: 'NATIONAL' as const, source: 'NAGER' as const,
  }

  function rulesService() {
    const repos = repositories({
      findHolidayById: vi.fn().mockResolvedValue(holidayRow),
      upsertHolidayRules: vi.fn().mockResolvedValue([]),
    })
    return { service: service(repos, provider()), repos }
  }

  it('stores a moved day off', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(rootAdmin, 'holiday-1', { userIds: null, dayOff: true, observedDate: '2026-09-08' })
    expect(repos.upsertHolidayRules).toHaveBeenCalledWith([expect.objectContaining({
      observedDate: '2026-09-08', bridgeDate: null,
    })])
  })

  it('stores a bridged day off', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(rootAdmin, 'holiday-1', { userIds: null, dayOff: true, bridgeDate: '2026-09-08' })
    expect(repos.upsertHolidayRules).toHaveBeenCalledWith([expect.objectContaining({ bridgeDate: '2026-09-08' })])
  })

  it('refuses moving a day off that does not exist', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(rootAdmin, 'holiday-1', {
      userIds: null, dayOff: false, observedDate: '2026-09-08',
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses moving a day off onto the holiday itself', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(rootAdmin, 'holiday-1', {
      userIds: null, dayOff: true, observedDate: '2026-09-07',
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a malformed date', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(rootAdmin, 'holiday-1', {
      userIds: null, dayOff: true, bridgeDate: '08/09/2026',
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a date far from the holiday, which is almost always a mistyped year', async () => {
    const { service: holidays } = rulesService()
    await expect(holidays.saveRule(rootAdmin, 'holiday-1', {
      userIds: null, dayOff: true, bridgeDate: '2027-09-08',
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('accepts a date just before the holiday', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(rootAdmin, 'holiday-1', { userIds: null, dayOff: true, bridgeDate: '2026-09-04' })
    expect(repos.upsertHolidayRules).toHaveBeenCalledWith([expect.objectContaining({ bridgeDate: '2026-09-04' })])
  })

  it('treats empty dates as absent', async () => {
    const { service: holidays, repos } = rulesService()
    await holidays.saveRule(rootAdmin, 'holiday-1', { userIds: null, dayOff: true, observedDate: null, bridgeDate: null })
    expect(repos.upsertHolidayRules).toHaveBeenCalledWith([expect.objectContaining({
      observedDate: null, bridgeDate: null,
    })])
  })
})

describe('HolidayService rule precedence', () => {
  const holidayRow = {
    id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
    date: '2026-09-07', name: 'Independência do Brasil', scope: 'NATIONAL' as const, source: 'NAGER' as const,
  }

  async function dayOffFor(ruleDayOff: boolean | null, scope: 'NATIONAL' | 'SUBDIVISION' = 'NATIONAL') {
    const repos = repositories({
      findResolvedHolidays: vi.fn().mockResolvedValue([{
        holiday: { ...holidayRow, scope }, ruleId: ruleDayOff === null ? null : 'rule-1',
        ruleUserId: null, ruleDayOff, ruleObservedDate: null, ruleBridgeDate: null,
      }]),
    })
    const calendar = await service(repos, provider()).calendarFor(user(), '2026-09-01', '2026-09-30')
    return calendar.isDayOff('2026-09-07')
  }

  it('falls back to the scope default when no rule applies', async () => {
    expect(await dayOffFor(null)).toBe(true)
    expect(await dayOffFor(null, 'SUBDIVISION')).toBe(false)
  })

  it('lets a rule turn a national holiday into a working day', async () => {
    expect(await dayOffFor(false)).toBe(false)
  })

  it('lets a rule turn a state holiday into a day off', async () => {
    expect(await dayOffFor(true, 'SUBDIVISION')).toBe(true)
  })

  it('asks the database to resolve precedence for the user being calculated', async () => {
    const findResolvedHolidays = vi.fn().mockResolvedValue([])
    const repos = repositories({ findResolvedHolidays })
    const employee = user({ id: 'user-1', createdById: rootId })
    await service(repos, provider()).calendarFor(employee, '2026-09-01', '2026-09-30')
    expect(findResolvedHolidays).toHaveBeenCalledWith('BR', rootId, 'user-1', '2026-09-01', '2026-09-30')
  })
})

describe('HolidayService manual holidays', () => {
  const subAdmin = user({ id: '00000000-0000-4000-8000-00000000000e', role: 'ADMIN', createdById: rootId })
  const manager = user({ id: '00000000-0000-4000-8000-00000000000b', role: 'MANAGER', createdById: rootId })
  const created = {
    id: 'holiday-9', organizationId: rootId, countryCode: 'BR', subdivisionCode: null,
    date: '2026-01-25', name: 'Aniversário da cidade', scope: 'MUNICIPAL' as const, source: 'MANUAL' as const,
  }

  function manualService(overrides: Record<string, unknown> = {}) {
    const repos = repositories({
      createManualHoliday: vi.fn().mockResolvedValue(created),
      findOrganizationRootId: vi.fn().mockResolvedValue(rootId),
      ...overrides,
    })
    return { service: service(repos, provider()), repos }
  }
  const valid = { date: '2026-01-25', name: 'Aniversário da cidade', scope: 'MUNICIPAL' as const }

  it('registers a municipal holiday the provider does not know about', async () => {
    const { service: holidays, repos } = manualService()
    const result = await holidays.createHoliday(user(), valid)
    expect(repos.createManualHoliday).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: rootId, countryCode: 'BR', date: '2026-01-25',
      name: 'Aniversário da cidade', scope: 'MUNICIPAL', createdById: rootId, subdivisionCode: null,
    }))
    expect(result).toMatchObject({ holidayId: 'holiday-9', source: 'MANUAL', dayOff: true, kind: 'HOLIDAY' })
  })

  it('normalizes a subdivision code', async () => {
    const { service: holidays, repos } = manualService()
    await holidays.createHoliday(user(), { ...valid, subdivisionCode: ' br-sp ' })
    expect(repos.createManualHoliday).toHaveBeenCalledWith(expect.objectContaining({ subdivisionCode: 'BR-SP' }))
  })

  it('refuses a manual holiday from anyone but the root administrator', async () => {
    const { service: holidays } = manualService()
    await expect(holidays.createHoliday(subAdmin, valid)).rejects.toMatchObject({ statusCode: 403 })
    await expect(holidays.createHoliday(manager, valid)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects a scope that belongs to the provider catalogue', async () => {
    const { service: holidays } = manualService()
    await expect(holidays.createHoliday(user(), { ...valid, scope: 'NATIONAL' }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a blank name and a malformed date', async () => {
    const { service: holidays } = manualService()
    await expect(holidays.createHoliday(user(), { ...valid, name: '   ' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(holidays.createHoliday(user(), { ...valid, date: '25/01/2026' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a year far outside the supported range', async () => {
    const { service: holidays } = manualService()
    await expect(holidays.createHoliday(user(), { ...valid, date: '1899-01-25' }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a malformed subdivision code', async () => {
    const { service: holidays } = manualService()
    await expect(holidays.createHoliday(user(), { ...valid, subdivisionCode: 'Sao Paulo' }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('removes a manual holiday of the organization', async () => {
    const { service: holidays, repos } = manualService()
    await holidays.deleteHoliday(user(), 'holiday-9')
    expect(repos.deleteManualHoliday).toHaveBeenCalledWith('holiday-9', rootId)
  })

  it('reports a holiday it may not remove as missing', async () => {
    const { service: holidays } = manualService({ deleteManualHoliday: vi.fn().mockResolvedValue(false) })
    await expect(holidays.deleteHoliday(user(), 'holiday-9')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses removal from anyone but the root administrator', async () => {
    const { service: holidays } = manualService()
    await expect(holidays.deleteHoliday(subAdmin, 'holiday-9')).rejects.toMatchObject({ statusCode: 403 })
  })
})
