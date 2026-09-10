import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Repositories } from '../src/database/repositories.js'
import type { Holiday, User } from '../src/domain/types.js'
import type { HolidayCalendarEntry, HolidayCalendarSource } from '../src/shared/holiday-calendar.js'
import { buildHolidayCalendar } from '../src/shared/holiday-calendar.js'
import { AccessTokenDenylist, AuthService, type JwtCodec } from '../src/modules/auth/auth-service.js'
import type { PasswordResetEmailSender } from '../src/modules/auth/email-sender.js'
import { HistoryService } from '../src/modules/history/history-service.js'
import { UserService } from '../src/modules/users/user-service.js'
import { WorkTimeService } from '../src/modules/work-logs/work-time-service.js'
import { WorkLogService } from '../src/modules/work-logs/work-log-service.js'

const now = new Date('2026-07-14T15:00:00Z')
function user(overrides: Partial<User> = {}): User {
  return {
    id: '00000000-0000-4000-8000-000000000001', name: 'Root', email: 'root@example.com', passwordHash: 'hash',
    role: 'ADMIN', managerId: null, managerName: null, createdById: null, workStartDate: '2026-07-01',
    dailyWorkloadMinutes: 480, standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true,
    lunchDurationMinutes: 60, workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'], hourBankMinutes: 0,
    createdAt: now, updatedAt: now, ...overrides,
    workedDayTotals: overrides.workedDayTotals ?? { total: 0, inSchedule: 0, outsideSchedule: 0 },
  }
}
function repositories(methods: Record<string, unknown> = {}): Repositories {
  return methods as unknown as Repositories
}

function workLog(entryAt: string, exitAt: string): import('../src/domain/types.js').WorkLog {
  return {
    id: 'imported-log', userId: user().id, entryAt: new Date(entryAt), exitAt: new Date(exitAt), closeReason: 'EXIT',
    createdAt: new Date(entryAt), updatedAt: new Date(exitAt),
  }
}

describe('UserService characterization', () => {
  it('returns only public current-user fields', () => {
    expect(new UserService(repositories(), 10).currentUser(user())).toEqual({
      id: user().id, name: 'Root', email: 'root@example.com', role: 'ADMIN',
    })
  })
  it('rejects a missing user id', async () => {
    const service = new UserService(repositories({ findUserById: vi.fn().mockResolvedValue(null) }), 10)
    await expect(service.byId('missing')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('prevents common users from listing accounts', async () => {
    const service = new UserService(repositories(), 10)
    await expect(service.list(user({ role: 'USER' }))).rejects.toMatchObject({ statusCode: 403 })
  })
  it('lists only a manager direct team', async () => {
    const listManagerTeam = vi.fn().mockResolvedValue([user({ id: 'child', role: 'USER' })])
    const result = await new UserService(repositories({ listManagerTeam }), 10).list(user({ role: 'MANAGER' }))
    expect(result).toHaveLength(1); expect(listManagerTeam).toHaveBeenCalledWith(user().id)
  })
  it('lists the complete admin-created subtree', async () => {
    const listCreatedSubtree = vi.fn().mockResolvedValue([user(), user({ id: 'child' })])
    expect(await new UserService(repositories({ listCreatedSubtree }), 10).list(user())).toHaveLength(2)
  })
  it('calculates net workload from schedule and lunch', async () => {
    const saveUser = vi.fn(async (value: User) => value)
    const result = await new UserService(repositories({ saveUser }), 10).updateOwnSchedule(user(), {
      standardEntryTime: '08:30', standardExitTime: '17:30', lunchEnabled: true, lunchDurationMinutes: 60,
      workDays: ['MONDAY'],
    }) as { dailyWorkloadMinutes: number }
    expect(result.dailyWorkloadMinutes).toBe(480)
  })
  it('rejects exit before entry', async () => {
    const service = new UserService(repositories(), 10)
    await expect(service.updateOwnSchedule(user(), { standardEntryTime: '18:00', standardExitTime: '08:00' }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects lunch durations over four hours', async () => {
    await expect(new UserService(repositories(), 10).updateOwnSchedule(user(), { lunchDurationMinutes: 241 }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
  it('allows a manager to access a direct report', async () => {
    const actor = user({ role: 'MANAGER' }); const target = user({ id: 'child', role: 'USER', managerId: actor.id })
    await expect(new UserService(repositories(), 10).canAccess(actor, target)).resolves.toBe(true)
  })
  it('uses the creation tree for admin isolation', async () => {
    const isInCreatedSubtree = vi.fn().mockResolvedValue(false)
    await expect(new UserService(repositories({ isInCreatedSubtree }), 10).canAccess(user(), user({ id: 'foreign' }))).resolves.toBe(false)
  })
  it('creates a managed user with a normalized email and schedule', async () => {
    const created = user({ id: 'child', email: 'child@example.com', role: 'USER' })
    const createUser = vi.fn().mockResolvedValue(created)
    const service = new UserService(repositories({ emailExists: vi.fn().mockResolvedValue(false), createUser, findUserById: vi.fn().mockResolvedValue(user()) }), 4)
    await expect(service.create(user(), {
      name: ' Child ', email: 'CHILD@example.com', password: 'Password123', role: 'USER',
      standardEntryTime: '08:00', standardExitTime: '17:00', lunchEnabled: true, lunchDurationMinutes: 60, workDays: ['MONDAY'],
    })).resolves.toMatchObject({ id: 'child' })
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'child@example.com', dailyWorkloadMinutes: 480 }))
  })
  it('updates a user and prevents managers from changing roles', async () => {
    const target = user({ id: 'child', role: 'USER', managerId: null })
    const saveUser = vi.fn(async (value: User) => value)
    const service = new UserService(repositories({ findUserById: vi.fn().mockResolvedValue(target), saveUser, isInCreatedSubtree: vi.fn().mockResolvedValue(true) }), 4)
    await expect(service.update(user(), target.id, { name: 'Updated', standardEntryTime: '08:00', standardExitTime: '17:00', workDays: ['MONDAY'] }))
      .resolves.toMatchObject({ name: 'Updated' })
    await expect(service.update(user({ role: 'MANAGER' }), target.id, { name: 'Updated', role: 'ADMIN' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows only administrators to change a user email address', async () => {
    const target = user({ id: 'child', role: 'USER' })
    const saveUser = vi.fn(async (value: User) => value)
    const revokeAllBiometricCredentials = vi.fn()
    const admin = new UserService(repositories({
      findUserById: vi.fn().mockResolvedValue(target), saveUser,
      isInCreatedSubtree: vi.fn().mockResolvedValue(true), emailExists: vi.fn().mockResolvedValue(false),
      revokeAllBiometricCredentials,
    }), 10)
    await expect(admin.update(user(), target.id, { name: 'Child', email: 'NEW@example.com' })).resolves.toMatchObject({ email: 'new@example.com' })
    expect(revokeAllBiometricCredentials).toHaveBeenCalledWith(target.id)
    const manager = new UserService(repositories({ findUserById: vi.fn().mockResolvedValue(target) }), 10)
    await expect(manager.update(user({ role: 'MANAGER' }), target.id, { name: 'Child', email: 'new@example.com' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows administrators to assign an accessible manager', async () => {
    const target = user({ id: 'child', role: 'USER' }); const manager = user({ id: 'manager', role: 'MANAGER' })
    const saveUser = vi.fn(async (value: User) => value)
    const service = new UserService(repositories({ findUserById: vi.fn().mockImplementation(async (id: string) => id === target.id ? target : manager), saveUser, isInCreatedSubtree: vi.fn().mockResolvedValue(true) }), 4)
    await expect(service.assignManager(user(), target.id, manager.id)).resolves.toMatchObject({ managerId: manager.id })
  })
})

describe('AuthService characterization', () => {
  let passwordHash: string
  beforeAll(async () => { passwordHash = await bcrypt.hash('Password123', 10) })
  const codec: JwtCodec = {
    sign: (payload, options) => Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + options.expiresIn })).toString('base64url'),
    verify: (token) => JSON.parse(Buffer.from(token, 'base64url').toString('utf8')),
  }
  function service(methods: Record<string, unknown> = {}, customCodec = codec, emailSender: PasswordResetEmailSender | null = null) {
    const repo = repositories({ cleanupRefreshTokens: vi.fn(), createRefreshToken: vi.fn(), ...methods })
    const users = new UserService(repo, 10)
    return { auth: new AuthService(repo, users, customCodec, customCodec, 900, 2_592_000, 10, new AccessTokenDenylist(), emailSender, 'https://app.example.com'), repo }
  }
  it('rejects an unknown email without disclosing which field failed', async () => {
    await expect(service({ findUserByEmail: vi.fn().mockResolvedValue(null) }).auth.login({ email: 'x@y.com', password: 'x' }, true))
      .rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects an invalid password', async () => {
    await expect(service({ findUserByEmail: vi.fn().mockResolvedValue(user({ passwordHash })) }).auth.login({ email: 'x@y.com', password: 'wrong' }, true))
      .rejects.toMatchObject({ statusCode: 401 })
  })
  it('returns both tokens to the mobile flow', async () => {
    const result = await service({ findUserByEmail: vi.fn().mockResolvedValue(user({ passwordHash })) }).auth.login({ email: 'x@y.com', password: 'Password123' }, true)
    expect(result.token).toBeTruthy(); expect(result.refreshToken).toBeTruthy()
  })
  it('creates a random biometric secret and persists only its SHA-256 hash', async () => {
    const createBiometricCredential = vi.fn()
    const result = await service({ createBiometricCredential }).auth.createBiometricCredential(user())
    expect(result.credentialSecret).toHaveLength(43)
    expect(result.email).toBe(user().email)
    expect(createBiometricCredential).toHaveBeenCalledWith(expect.objectContaining({
      id: result.credentialId,
      userId: user().id,
      secretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }))
    expect(createBiometricCredential.mock.calls[0]![0].secretHash).not.toBe(result.credentialSecret)
  })
  it('creates a normal rotating session from valid biometric credentials', async () => {
    const useBiometricCredential = vi.fn().mockResolvedValue(user().id)
    const result = await service({
      useBiometricCredential,
      findUserById: vi.fn().mockResolvedValue(user()),
    }).auth.biometricLogin({
      email: ' ROOT@example.com ',
      credentialId: '00000000-0000-4000-8000-000000000009',
      credentialSecret: 's'.repeat(43),
    }, true)
    expect(useBiometricCredential).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000009', expect.stringMatching(/^[a-f0-9]{64}$/), 'root@example.com',
    )
    expect(result.refreshToken).toBeTruthy()
  })
  it('returns the same unauthorized response for an invalid biometric credential', async () => {
    await expect(service({ useBiometricCredential: vi.fn().mockResolvedValue(null) }).auth.biometricLogin({
      email: 'root@example.com',
      credentialId: '00000000-0000-4000-8000-000000000009',
      credentialSecret: 's'.repeat(43),
    }, true)).rejects.toMatchObject({ statusCode: 401, message: 'Biometric credentials are invalid' })
  })
  it('revokes only the biometric credential owned by the current user', async () => {
    const revokeBiometricCredential = vi.fn()
    await service({ revokeBiometricCredential }).auth.revokeBiometricCredential(user(), 'credential-id')
    expect(revokeBiometricCredential).toHaveBeenCalledWith('credential-id', user().id)
  })
  it('omits refresh token when requested by an internal caller', async () => {
    const result = await service({ findUserByEmail: vi.fn().mockResolvedValue(user({ passwordHash })) }).auth.login({ email: 'x@y.com', password: 'Password123' }, false)
    expect(result.refreshToken).toBeUndefined()
  })
  it('rejects duplicate public registration', async () => {
    await expect(service({ emailExists: vi.fn().mockResolvedValue(true) }).auth.register({ name: 'A', email: 'a@b.com', password: 'Password123' }, true))
      .rejects.toMatchObject({ statusCode: 409 })
  })
  it('creates public registrations as root ADMIN', async () => {
    const createUser = vi.fn().mockResolvedValue(user())
    await service({ emailExists: vi.fn().mockResolvedValue(false), createUser }).auth.register({ name: 'A', email: 'a@b.com', password: 'Password123' }, true)
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN', createdById: null }))
  })
  it('rejects a malformed refresh token', async () => {
    const badCodec: JwtCodec = { sign: codec.sign, verify: () => { throw new Error('bad') } }
    await expect(service({}, badCodec).auth.refresh('bad', true)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects access tokens with refresh type', () => {
    const token = codec.sign({ sub: user().id, jti: 'jti', type: 'refresh' }, { expiresIn: 900 })
    expect(() => service().auth.verifyAccess(token)).toThrow()
  })
  it('denies an access token after logout', async () => {
    const fixture = service(); const token = codec.sign({ sub: user().id, jti: 'jti', type: 'access' }, { expiresIn: 900 })
    await fixture.auth.logout(token, null)
    expect(() => fixture.auth.verifyAccess(token)).toThrow()
  })
  it('revokes the refresh family during logout', async () => {
    const revokeRefreshFamily = vi.fn(); const fixture = service({ revokeRefreshFamily })
    const token = codec.sign({ sub: user().id, jti: 'refresh-id', type: 'refresh', family: 'family' }, { expiresIn: 900 })
    await fixture.auth.logout(null, token)
    expect(revokeRefreshFamily).toHaveBeenCalledOnce()
  })
  it('changes the password only after validating the current password and revokes all sessions', async () => {
    const updatePassword = vi.fn(); const revokeAllRefreshTokens = vi.fn(); const revokeAllBiometricCredentials = vi.fn()
    await service({ updatePassword, revokeAllRefreshTokens, revokeAllBiometricCredentials }).auth.changePassword(user({ passwordHash }), 'Password123', 'NewPassword123')
    expect(updatePassword).toHaveBeenCalledWith(user().id, expect.any(String))
    expect(revokeAllRefreshTokens).toHaveBeenCalledWith(user().id)
    expect(revokeAllBiometricCredentials).toHaveBeenCalledWith(user().id)
  })
  it('creates a hashed, expiring reset token and sends only its link by email', async () => {
    const sendPasswordReset = vi.fn()
    const fixture = service({ findUserByEmail: vi.fn().mockResolvedValue(user()), cleanupPasswordResetTokens: vi.fn(), createPasswordResetToken: vi.fn() }, codec, { sendPasswordReset })
    await fixture.auth.requestPasswordReset('ROOT@example.com')
    expect(fixture.repo.createPasswordResetToken).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: expect.not.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresAt: expect.any(Date) }))
    expect(sendPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ recipient: 'root@example.com', resetUrl: expect.stringContaining('/reset-password?token=') }))
  })
  it('accepts a valid reset only once and revokes every refresh session', async () => {
    const resetPasswordWithToken = vi.fn().mockResolvedValue(true)
    await service({ resetPasswordWithToken }).auth.resetPassword('a'.repeat(43), 'NewPassword123')
    expect(resetPasswordWithToken).toHaveBeenCalledWith(expect.any(String), expect.any(String))
  })
})

describe('Administrative work-log characterization', () => {
  const workTime = new WorkTimeService('America/Sao_Paulo')
  it('creates a closed EXIT record for a forgotten day', async () => {
    const createClosedWorkLog = vi.fn().mockResolvedValue({
      id: 'log', userId: user().id, entryAt: new Date('2026-07-13T11:00:00Z'), exitAt: new Date('2026-07-13T20:00:00Z'),
      closeReason: 'EXIT', createdAt: now, updatedAt: now,
    })
    const service = new WorkLogService(repositories({ createClosedWorkLog }), workTime, 'America/Sao_Paulo')
    await expect(service.createAdministrative(user(), new Date('2026-07-13T11:00:00Z'), new Date('2026-07-13T20:00:00Z')))
      .resolves.toMatchObject({ closeReason: 'EXIT' })
    expect(createClosedWorkLog).toHaveBeenCalledWith(user().id, expect.any(Date), expect.any(Date))
  })
  it('rejects an administrative exit before its entry', async () => {
    const service = new WorkLogService(repositories(), workTime, 'America/Sao_Paulo')
    await expect(service.createAdministrative(user(), new Date('2026-07-13T20:00:00Z'), new Date('2026-07-13T11:00:00Z')))
      .rejects.toMatchObject({ statusCode: 400 })
  })
  it('deletes a closed administrative record', async () => {
    const deleteClosedWorkLog = vi.fn().mockResolvedValue(true)
    const service = new WorkLogService(repositories({ deleteClosedWorkLog }), workTime, 'America/Sao_Paulo')
    await expect(service.deleteAdministrative(user(), 'log')).resolves.toBeUndefined()
    expect(deleteClosedWorkLog).toHaveBeenCalledWith(user().id, 'log')
  })
  it('reports a missing administrative record when deleting', async () => {
    const service = new WorkLogService(repositories({ deleteClosedWorkLog: vi.fn().mockResolvedValue(false) }), workTime, 'America/Sao_Paulo')
    await expect(service.deleteAdministrative(user(), 'missing-log')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('recalculates the accumulated hour bank and replaces its stored balance', async () => {
    const imported = workLog('2026-07-13T11:00:00Z', '2026-07-13T20:00:00Z')
    const replaceHourBankMinutes = vi.fn().mockResolvedValue({ previousHourBankMinutes: 15, hourBankMinutes: 60 })
    const service = new WorkLogService(repositories({
      findFirstWorkLog: vi.fn().mockResolvedValue(imported), findWorkLogsUntil: vi.fn().mockResolvedValue([imported]), replaceHourBankMinutes,
    }), workTime, 'America/Sao_Paulo')

    await expect(service.recalculateHourBank(user({ workStartDate: '2026-07-13' }), now)).resolves.toEqual({ previousHourBankMinutes: 15, hourBankMinutes: 60 })
    expect(replaceHourBankMinutes).toHaveBeenCalledWith(user().id, 60)
  })
  it('recalculates persisted worked day totals', async () => {
    const recalculateWorkedDayTotals = vi.fn().mockResolvedValue({ total: 3, inSchedule: 2, outsideSchedule: 1 })
    const service = new WorkLogService(repositories({ recalculateWorkedDayTotals }), workTime, 'America/Sao_Paulo')

    await expect(service.recalculateWorkedDays(user())).resolves.toEqual({ total: 3, inSchedule: 2, outsideSchedule: 1 })
    expect(recalculateWorkedDayTotals).toHaveBeenCalledWith(user().id)
  })
  it('registers entry and exposes the updated dashboard', async () => {
    const openWorkLog = vi.fn(); const dashboard = vi.fn().mockResolvedValue([])
    const service = new WorkLogService(repositories({
      openWorkLog, findWorkLogsOverlappingRange: dashboard, findFirstWorkLog: vi.fn().mockResolvedValue(null), findWorkLogsUntil: vi.fn().mockResolvedValue([]),
    }), workTime, 'America/Sao_Paulo')
    await service.register(user(), 'entry', now)
    expect(openWorkLog).toHaveBeenCalledWith(user().id, now)
  })
  it('rejects closing an absent open entry and lunch when disabled', async () => {
    const service = new WorkLogService(repositories({ closeOpenWorkLog: vi.fn().mockResolvedValue(false) }), workTime, 'America/Sao_Paulo')
    await expect(service.register(user(), 'pause', now)).rejects.toMatchObject({ statusCode: 409 })
    await expect(service.register(user({ lunchEnabled: false }), 'lunch', now)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('includes imported work before the start date in the dashboard hour bank', async () => {
    const imported = workLog('2026-07-13T11:00:00Z', '2026-07-13T20:00:00Z')
    const service = new WorkLogService(repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue([]),
      findFirstWorkLog: vi.fn().mockResolvedValue(imported),
      findWorkLogsUntil: vi.fn().mockResolvedValue([imported]),
    }), workTime, 'America/Sao_Paulo')

    const result = await service.dashboard(user({ workStartDate: '2026-07-14' }), now)

    expect(result.hourBankMinutes).toBe(60)
  })
})

describe('HistoryService characterization', () => {
  const workTime = new WorkTimeService('America/Sao_Paulo')
  function history(methods: Record<string, unknown> = {}) {
    return new HistoryService(repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue([]), findFirstWorkLog: vi.fn().mockResolvedValue(null),
      findWorkLogsUntil: vi.fn().mockResolvedValue([]), ...methods,
    }), workTime, 'America/Sao_Paulo')
  }
  it('rejects reversed periods', async () => {
    await expect(history().get(user(), '2026-07-15', '2026-07-14')).rejects.toMatchObject({ statusCode: 400 })
  })
  it('accepts periods longer than 90 days', async () => {
    await expect(history().get(user(), '2026-01-01', '2026-04-02')).resolves.toMatchObject({
      startDate: '2026-01-01', endDate: '2026-04-02',
    })
  })
  it('adds absences for past configured work days', async () => {
    const result = await history().get(user({ workStartDate: '2026-07-13' }), '2026-07-13', '2026-07-13', 90, 0, now)
    expect(result.days[0]).toMatchObject({ workedMinutes: 0, balanceMinutes: -480, isComplete: true })
  })
  it('does not add absence for a non-work day', async () => {
    const result = await history().get(user({ workStartDate: '2026-07-12' }), '2026-07-12', '2026-07-12', 90, 0, now)
    expect(result.days).toEqual([])
  })
  it('returns pagination metadata without removing totals', async () => {
    const result = await history().get(user({ workStartDate: '2026-07-13' }), '2026-07-13', '2026-07-14', 1, 0, now)
    expect(result.pagination).toEqual({ limit: 1, offset: 0, total: 1 })
    expect(result).toHaveProperty('totalWorkedMinutes')
  })
  it('accumulates imported work before the start date independently of the selected period', async () => {
    const imported = workLog('2026-07-13T11:00:00Z', '2026-07-13T20:00:00Z')
    const findWorkLogsUntil = vi.fn().mockResolvedValue([imported])
    const service = history({ findFirstWorkLog: vi.fn().mockResolvedValue(imported), findWorkLogsUntil })
    const account = user({ workStartDate: '2026-07-14' })

    const currentPeriod = await service.get(account, '2026-07-14', '2026-07-14', 90, 0, now)
    const importedPeriod = await service.get(account, '2026-07-13', '2026-07-13', 90, 0, now)

    expect(currentPeriod.hourBankMinutes).toBe(60)
    expect(importedPeriod.hourBankMinutes).toBe(60)
    expect(findWorkLogsUntil).toHaveBeenCalledWith(
      account.id, new Date('2026-07-12T03:00:00.000Z'), new Date('2026-07-15T03:00:00.000Z'),
    )
  })
  it('matches the seven supplied August records and exposes persisted absolute day totals', async () => {
    const logs = [
      workLog('2026-08-18T11:21:00Z', '2026-08-18T20:20:00Z'),
      workLog('2026-08-19T11:23:00Z', '2026-08-19T20:19:00Z'),
      workLog('2026-08-20T11:22:00Z', '2026-08-20T20:19:00Z'),
      workLog('2026-08-21T11:06:00Z', '2026-08-21T20:10:00Z'),
      workLog('2026-08-24T11:13:00Z', '2026-08-24T20:09:00Z'),
      workLog('2026-08-25T11:19:00Z', '2026-08-25T20:19:00Z'),
      workLog('2026-08-26T11:23:00Z', '2026-08-26T20:19:00Z'),
    ]
    const account = user({
      workStartDate: '2026-08-18', dailyWorkloadMinutes: 530,
      workedDayTotals: { total: 7, inSchedule: 7, outsideSchedule: 0 },
    })
    const result = await history({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue(logs), findFirstWorkLog: vi.fn().mockResolvedValue(logs[0]),
      findWorkLogsUntil: vi.fn().mockResolvedValue(logs),
    }).get(account, '2026-08-01', '2026-08-31', 90, 0, new Date('2026-08-27T15:00:00Z'))

    expect(result.totalBalanceMinutes).toBe(58)
    expect(result.hourBankMinutes).toBe(58)
    expect(result.workedDayTotals).toEqual({ total: 7, inSchedule: 7, outsideSchedule: 0 })
  })
  it('adds nine hours for a prior weekend record while preserving the configured workday calculation', async () => {
    const weekdays = [
      workLog('2026-08-18T11:21:00Z', '2026-08-18T20:20:00Z'),
      workLog('2026-08-19T11:23:00Z', '2026-08-19T20:19:00Z'),
      workLog('2026-08-20T11:22:00Z', '2026-08-20T20:19:00Z'),
      workLog('2026-08-21T11:06:00Z', '2026-08-21T20:10:00Z'),
      workLog('2026-08-24T11:13:00Z', '2026-08-24T20:09:00Z'),
      workLog('2026-08-25T11:19:00Z', '2026-08-25T20:19:00Z'),
      workLog('2026-08-26T11:23:00Z', '2026-08-26T20:19:00Z'),
    ]
    const weekend = workLog('2026-08-15T11:00:00Z', '2026-08-15T20:00:00Z')
    const logs = [weekend, ...weekdays]
    const account = user({ workStartDate: '2026-08-18', dailyWorkloadMinutes: 530 })
    const result = await history({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue(weekdays), findFirstWorkLog: vi.fn().mockResolvedValue(weekend),
      findWorkLogsUntil: vi.fn().mockResolvedValue(logs),
    }).get(account, '2026-08-01', '2026-08-31', 90, 0, new Date('2026-08-27T15:00:00Z'))

    expect(result.hourBankMinutes).toBe(598)
  })
  it('lists closed days outside the schedule using the historical schedule version', async () => {
    const saturday = workLog('2026-08-15T11:00:00Z', '2026-08-15T20:00:00Z')
    const monday = workLog('2026-08-17T11:00:00Z', '2026-08-17T20:00:00Z')
    const result = await history({
      findClosedWorkLogs: vi.fn().mockResolvedValue([saturday, monday]),
      findWorkScheduleVersions: vi.fn().mockResolvedValue([
        { effectiveFrom: '0001-01-01', workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] },
      ]),
    }).outsideScheduleDays(user())

    expect(result).toEqual({
      days: [{ date: '2026-08-15', workedMinutes: 540, workLogs: [expect.objectContaining({ id: saturday.id })] }],
      pagination: { limit: 10, offset: 0, total: 1 },
    })
  })
  it('splits a closed interval that crosses midnight into both outside-schedule dates', async () => {
    const crossingMidnight = workLog('2026-08-16T02:30:00Z', '2026-08-16T04:30:00Z')
    const result = await history({
      findClosedWorkLogs: vi.fn().mockResolvedValue([crossingMidnight]),
      findWorkScheduleVersions: vi.fn().mockResolvedValue([
        { effectiveFrom: '0001-01-01', workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] },
      ]),
    }).outsideScheduleDays(user())

    expect(result.days).toEqual([
      expect.objectContaining({ date: '2026-08-16', workedMinutes: 90 }),
      expect.objectContaining({ date: '2026-08-15', workedMinutes: 30 }),
    ])
  })
})

describe('Holiday characterization', () => {
  const workTime = new WorkTimeService('America/Sao_Paulo')
  const timeZone = 'America/Sao_Paulo'
  // 2026-07-13 is a Monday and is in the past relative to `now`, so an absence would be charged.
  const holidayDate = '2026-07-13'
  const todayDate = '2026-07-14'

  function holiday(overrides: Partial<Holiday> = {}): Holiday {
    return {
      id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
      date: holidayDate, name: 'Feriado de teste', scope: 'NATIONAL', source: 'NAGER', ...overrides,
    }
  }
  function entry(overrides: Partial<HolidayCalendarEntry> = {}): HolidayCalendarEntry {
    return { holiday: holiday(), dayOff: true, ruleId: null, observedDate: null, bridgeDate: null, ...overrides }
  }
  function calendarSource(entries: HolidayCalendarEntry[]): HolidayCalendarSource {
    const calendar = buildHolidayCalendar(entries)
    return { calendarFor: async () => calendar }
  }
  const dayOffSource = calendarSource([entry()])
  const workingHolidaySource = calendarSource([entry({ dayOff: false })])
  const todayDayOffSource = calendarSource([entry({ holiday: holiday({ date: todayDate }) })])

  function history(methods: Record<string, unknown> = {}, holidays?: HolidayCalendarSource) {
    const repos = repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue([]), findFirstWorkLog: vi.fn().mockResolvedValue(null),
      findWorkLogsUntil: vi.fn().mockResolvedValue([]), ...methods,
    })
    return holidays
      ? new HistoryService(repos, workTime, timeZone, holidays)
      : new HistoryService(repos, workTime, timeZone)
  }

  it('keeps the previous behaviour when no calendar source is wired in', async () => {
    const result = await history().get(user({ workStartDate: '2026-07-13' }), holidayDate, holidayDate, 90, 0, now)
    expect(result.days[0]).toMatchObject({ balanceMinutes: -480, holiday: null, workedOnHoliday: false })
  })

  it('does not charge an absence for a holiday without records', async () => {
    const result = await history({}, dayOffSource)
      .get(user({ workStartDate: '2026-07-13' }), holidayDate, holidayDate, 90, 0, now)
    expect(result.days[0]).toMatchObject({ workedMinutes: 0, balanceMinutes: 0, isComplete: true })
  })

  it('still shows the holiday in the history so the day does not vanish', async () => {
    const result = await history({}, dayOffSource)
      .get(user({ workStartDate: '2026-07-13' }), holidayDate, holidayDate, 90, 0, now)
    expect(result.days).toHaveLength(1)
    expect(result.days[0]?.holiday).toMatchObject({ name: 'Feriado de teste', scope: 'NATIONAL', dayOff: true })
  })

  it('charges the full workload when the holiday is not a day off', async () => {
    const result = await history({}, workingHolidaySource)
      .get(user({ workStartDate: '2026-07-13' }), holidayDate, holidayDate, 90, 0, now)
    expect(result.days[0]).toMatchObject({ balanceMinutes: -480, holiday: expect.objectContaining({ dayOff: false }) })
  })

  it('credits every worked minute on a holiday and flags the day', async () => {
    const worked = [workLog('2026-07-13T11:00:00Z', '2026-07-13T15:00:00Z')]
    const result = await history({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue(worked),
    }, dayOffSource).get(user({ workStartDate: '2026-07-13' }), holidayDate, holidayDate, 90, 0, now)
    expect(result.days[0]).toMatchObject({ workedMinutes: 240, balanceMinutes: 240, workedOnHoliday: true })
  })

  it('does not flag a worked holiday when the day carries no holiday', async () => {
    const worked = [workLog('2026-07-13T11:00:00Z', '2026-07-13T15:00:00Z')]
    const result = await history({ findWorkLogsOverlappingRange: vi.fn().mockResolvedValue(worked) })
      .get(user({ workStartDate: '2026-07-13' }), holidayDate, holidayDate, 90, 0, now)
    expect(result.days[0]).toMatchObject({ workedOnHoliday: false, holiday: null })
  })

  it('leaves the hour bank untouched by a holiday with no records', () => {
    const calendar = buildHolidayCalendar([entry()])
    expect(workTime.hourBank([], 480, ['MONDAY', 'TUESDAY'], '2026-07-13', '2026-07-15', '2026-07-13', calendar))
      .toBe(-480)
  })

  it('does not calculate an expected exit over a zero workload holiday', () => {
    const calendar = buildHolidayCalendar([entry()])
    const logs = [workLog('2026-07-13T11:30:00Z', '2026-07-13T15:00:00Z')]
    expect(workTime.expectedExit(logs, holidayDate, 480, ['MONDAY'], false, 0, calendar)?.toISOString())
      .toBe('2026-07-13T11:30:00.000Z')
  })

  it('exposes the holiday on the dashboard', async () => {
    const repos = repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue([]), findFirstWorkLog: vi.fn().mockResolvedValue(null),
      findWorkLogsUntil: vi.fn().mockResolvedValue([]),
    })
    const dashboard = await new WorkLogService(repos, workTime, timeZone, todayDayOffSource).dashboard(user(), now)
    expect(dashboard).toMatchObject({
      date: todayDate, balanceMinutesToday: 0, workedOnHoliday: false,
      holiday: expect.objectContaining({ name: 'Feriado de teste', dayOff: true }),
    })
  })

  it('reports no holiday on the dashboard when there is none', async () => {
    const repos = repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue([]), findFirstWorkLog: vi.fn().mockResolvedValue(null),
      findWorkLogsUntil: vi.fn().mockResolvedValue([]),
    })
    const dashboard = await new WorkLogService(repos, workTime, timeZone).dashboard(user(), now)
    expect(dashboard).toMatchObject({ holiday: null, workedOnHoliday: false, balanceMinutesToday: -480 })
  })
})

describe('Holiday move and bridge characterization', () => {
  const workTime = new WorkTimeService('America/Sao_Paulo')
  const timeZone = 'America/Sao_Paulo'
  // 2026-07-13 is a Monday and 2026-07-14 a Tuesday, both scheduled and both in the past.
  const holidayDate = '2026-07-13'
  const nextDay = '2026-07-14'

  function holiday(): Holiday {
    return {
      id: 'holiday-1', organizationId: null, countryCode: 'BR', subdivisionCode: null,
      date: holidayDate, name: 'Feriado de teste', scope: 'NATIONAL', source: 'NAGER',
    }
  }
  function entry(overrides: Partial<HolidayCalendarEntry> = {}): HolidayCalendarEntry {
    return { holiday: holiday(), dayOff: true, ruleId: 'rule-1', observedDate: null, bridgeDate: null, ...overrides }
  }
  function source(overrides: Partial<HolidayCalendarEntry> = {}): HolidayCalendarSource {
    const calendar = buildHolidayCalendar([entry(overrides)])
    return { calendarFor: async () => calendar }
  }
  function history(holidays: HolidayCalendarSource) {
    return new HistoryService(repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue([]), findFirstWorkLog: vi.fn().mockResolvedValue(null),
      findWorkLogsUntil: vi.fn().mockResolvedValue([]),
    }), workTime, timeZone, holidays)
  }
  const employee = () => user({ workStartDate: '2026-07-13' })
  const dayAt = async (holidays: HolidayCalendarSource, date: string) => {
    const result = await history(holidays).get(employee(), holidayDate, nextDay, 90, 0, now)
    return result.days.find((day) => day.date === date)
  }

  it('charges the holiday and clears the observed day when the date is moved', async () => {
    const moved = source({ observedDate: nextDay })
    expect(await dayAt(moved, holidayDate)).toMatchObject({
      balanceMinutes: -480, holiday: expect.objectContaining({ kind: 'HOLIDAY', dayOff: false }),
    })
    expect(await dayAt(moved, nextDay)).toMatchObject({
      balanceMinutes: 0, holiday: expect.objectContaining({ kind: 'OBSERVED', dayOff: true }),
    })
  })

  it('reports the original holiday date on a moved day off', async () => {
    const day = await dayAt(source({ observedDate: nextDay }), nextDay)
    expect(day?.holiday).toMatchObject({ date: nextDay, holidayDate, name: 'Feriado de teste' })
  })

  it('clears both days when the holiday is bridged', async () => {
    const bridged = source({ bridgeDate: nextDay })
    expect(await dayAt(bridged, holidayDate)).toMatchObject({ balanceMinutes: 0 })
    expect(await dayAt(bridged, nextDay)).toMatchObject({
      balanceMinutes: 0, holiday: expect.objectContaining({ kind: 'BRIDGE' }),
    })
  })

  it('keeps the hour bank consistent with a moved day off', () => {
    const moved = buildHolidayCalendar([entry({ observedDate: nextDay })])
    const plain = buildHolidayCalendar([entry()])
    const workDays = ['MONDAY', 'TUESDAY'] as const
    // Either way exactly one of the two days is charged, so the total is the same.
    expect(workTime.hourBank([], 480, workDays, holidayDate, '2026-07-15', holidayDate, moved)).toBe(-480)
    expect(workTime.hourBank([], 480, workDays, holidayDate, '2026-07-15', holidayDate, plain)).toBe(-480)
  })

  it('costs one extra day of workload when the holiday is bridged', () => {
    const bridged = buildHolidayCalendar([entry({ bridgeDate: nextDay })])
    expect(workTime.hourBank([], 480, ['MONDAY', 'TUESDAY'], holidayDate, '2026-07-15', holidayDate, bridged)).toBe(0)
  })

  it('credits work done on a holiday whose day off was moved away', async () => {
    const worked = [workLog('2026-07-13T11:00:00Z', '2026-07-13T15:00:00Z')]
    const service = new HistoryService(repositories({
      findWorkLogsOverlappingRange: vi.fn().mockResolvedValue(worked),
      findFirstWorkLog: vi.fn().mockResolvedValue(null), findWorkLogsUntil: vi.fn().mockResolvedValue([]),
    }), workTime, timeZone, source({ observedDate: nextDay }))
    const result = await service.get(employee(), holidayDate, holidayDate, 90, 0, now)
    // The workload still applies on that date, so four hours worked is a four hour shortfall.
    expect(result.days[0]).toMatchObject({ workedMinutes: 240, balanceMinutes: -240, workedOnHoliday: true })
  })
})
