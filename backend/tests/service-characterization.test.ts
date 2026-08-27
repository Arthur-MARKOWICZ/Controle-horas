import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Repositories } from '../src/database/repositories.js'
import type { User } from '../src/domain/types.js'
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
    lunchDurationMinutes: 60, workDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'],
    createdAt: now, updatedAt: now, ...overrides,
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
    const admin = new UserService(repositories({ findUserById: vi.fn().mockResolvedValue(target), saveUser, isInCreatedSubtree: vi.fn().mockResolvedValue(true), emailExists: vi.fn().mockResolvedValue(false) }), 10)
    await expect(admin.update(user(), target.id, { name: 'Child', email: 'NEW@example.com' })).resolves.toMatchObject({ email: 'new@example.com' })
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
    const updatePassword = vi.fn(); const revokeAllRefreshTokens = vi.fn()
    await service({ updatePassword, revokeAllRefreshTokens }).auth.changePassword(user({ passwordHash }), 'Password123', 'NewPassword123')
    expect(updatePassword).toHaveBeenCalledWith(user().id, expect.any(String))
    expect(revokeAllRefreshTokens).toHaveBeenCalledWith(user().id)
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
  it('rejects periods longer than 90 days', async () => {
    await expect(history().get(user(), '2026-01-01', '2026-04-02')).rejects.toMatchObject({ statusCode: 400 })
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
})
