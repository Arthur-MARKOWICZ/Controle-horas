import bcrypt from 'bcryptjs'
import type { Repositories } from '../../database/repositories.js'
import type { User, UserRole, WorkDay } from '../../domain/types.js'
import { USER_ROLES, WORK_DAYS } from '../../domain/types.js'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js'

export interface ScheduleInput {
  standardEntryTime?: string | null; standardExitTime?: string | null; lunchEnabled?: boolean
  lunchDurationMinutes?: number; workDays?: WorkDay[]; workStartDate?: string | null
}

export interface ManagedUserInput extends ScheduleInput {
  name: string; email?: string; password?: string; role?: string; managerId?: string | null
}

function timeMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match) throw new ValidationError('Time must use HH:mm format')
  const hours = Number(match[1]); const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new ValidationError('Time must be valid')
  return hours * 60 + minutes
}

function roleOf(value: string | undefined, fallback: UserRole): UserRole {
  if (!value) return fallback
  const role = value.toUpperCase() as UserRole
  if (!USER_ROLES.includes(role)) throw new ValidationError('Invalid role. Allowed values: ADMIN, MANAGER, USER')
  return role
}

export class UserService {
  constructor(private readonly repositories: Repositories, private readonly bcryptRounds: number) {}

  async byEmail(email: string): Promise<User> {
    const user = await this.repositories.findUserByEmail(email.trim().toLowerCase())
    if (!user) throw new NotFoundError('User not found')
    return user
  }

  async byId(id: string): Promise<User> {
    const user = await this.repositories.findUserById(id)
    if (!user) throw new NotFoundError('User not found')
    return user
  }

  currentUser(user: User): object {
    return { id: user.id, name: user.name, email: user.email, role: user.role }
  }

  private schedule(current: User, input: ScheduleInput): User {
    const entry = input.standardEntryTime === undefined ? current.standardEntryTime : input.standardEntryTime
    const exit = input.standardExitTime === undefined ? current.standardExitTime : input.standardExitTime
    const lunchEnabled = input.lunchEnabled ?? current.lunchEnabled
    const lunchDuration = input.lunchDurationMinutes ?? current.lunchDurationMinutes
    const workDays = input.workDays ?? current.workDays
    if (lunchDuration < 0 || lunchDuration > 240) throw new ValidationError('Lunch duration must be between 0 and 240 minutes')
    if (workDays.some((day) => !WORK_DAYS.includes(day))) throw new ValidationError('Work days contain an invalid value')

    let workload = 0
    if (entry || exit || workDays.length > 0) {
      if (!entry || !exit || workDays.length === 0) throw new ValidationError('Entry, exit and at least one work day are required')
      const duration = timeMinutes(exit) - timeMinutes(entry)
      workload = duration - (lunchEnabled ? lunchDuration : 0)
      if (duration <= 0) throw new ValidationError('Standard exit time must be after standard entry time')
      if (workload < 1 || workload > 1_440) throw new ValidationError('Daily workload must be between 1 and 1440 minutes after lunch')
    }
    return {
      ...current, standardEntryTime: entry, standardExitTime: exit, lunchEnabled,
      lunchDurationMinutes: lunchDuration, workDays, dailyWorkloadMinutes: workload,
      workStartDate: input.workStartDate === undefined ? current.workStartDate : input.workStartDate,
    }
  }

  async updateOwnSchedule(user: User, input: ScheduleInput): Promise<object> {
    const saved = await this.repositories.saveUser(this.schedule(user, input))
    return this.scheduleResponse(saved)
  }

  async canAccess(actor: User, target: User): Promise<boolean> {
    if (actor.id === target.id) return true
    if (actor.role === 'ADMIN') return this.repositories.isInCreatedSubtree(actor.id, target.id)
    return actor.role === 'MANAGER' && target.managerId === actor.id
  }

  async requireAccess(actor: User, targetId: string): Promise<User> {
    const target = await this.byId(targetId)
    if (!(await this.canAccess(actor, target))) throw new ForbiddenError('You do not have permission to access this user')
    return target
  }

  private requireManager(actor: User): void {
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') throw new ForbiddenError('You do not have permission to manage users')
  }

  async list(actor: User): Promise<object[]> {
    this.requireManager(actor)
    const users = actor.role === 'ADMIN'
      ? await this.repositories.listCreatedSubtree(actor.id)
      : await this.repositories.listManagerTeam(actor.id)
    return users.map((user) => this.response(user))
  }

  async create(actor: User, input: ManagedUserInput): Promise<object> {
    this.requireManager(actor)
    if (!input.email || !input.password || !input.role) throw new ValidationError('Email, password and role are required')
    const email = input.email.trim().toLowerCase()
    if (await this.repositories.emailExists(email)) throw new ConflictError('Email is already registered')
    const role = roleOf(input.role, 'USER')
    if (actor.role === 'MANAGER' && role !== 'USER') throw new ForbiddenError('Managers can only create common users')
    let managerId: string | null = null
    if (actor.role === 'MANAGER') managerId = actor.id
    else if (role !== 'ADMIN') managerId = input.managerId ?? actor.id
    if (managerId) {
      const manager = await this.requireAccess(actor, managerId)
      if (manager.role !== 'ADMIN' && manager.role !== 'MANAGER') throw new ValidationError('Assigned manager must have MANAGER or ADMIN role')
    }
    const blank = this.schedule({
      id: '', name: '', email, passwordHash: '', role, managerId, managerName: null, createdById: actor.id,
      dailyWorkloadMinutes: 0, standardEntryTime: null, standardExitTime: null, lunchEnabled: false,
      lunchDurationMinutes: 0, workDays: [], workStartDate: null, hourBankMinutes: 0,
      workedDayTotals: { total: 0, inSchedule: 0, outsideSchedule: 0 }, createdAt: new Date(), updatedAt: new Date(),
    }, input)
    const user = await this.repositories.createUser({
      name: input.name.trim(), email, passwordHash: await bcrypt.hash(input.password, this.bcryptRounds), role,
      managerId, createdById: actor.id, workStartDate: blank.workStartDate,
      dailyWorkloadMinutes: blank.dailyWorkloadMinutes, standardEntryTime: blank.standardEntryTime,
      standardExitTime: blank.standardExitTime, lunchEnabled: blank.lunchEnabled,
      lunchDurationMinutes: blank.lunchDurationMinutes, workDays: blank.workDays,
    })
    return this.response(user)
  }

  async update(actor: User, targetId: string, input: ManagedUserInput): Promise<object> {
    this.requireManager(actor)
    let target = await this.requireAccess(actor, targetId)
    let email = target.email
    if (input.email !== undefined) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError('Only administrators can change user email addresses')
      email = input.email.trim().toLowerCase()
      if (email !== target.email && await this.repositories.emailExists(email)) throw new ConflictError('Email is already registered')
    }
    const role = roleOf(input.role, target.role)
    if (role !== target.role && actor.role !== 'ADMIN') throw new ForbiddenError('Only administrators can change user roles')
    let managerId = target.managerId
    if (role === 'ADMIN') managerId = null
    else if (actor.role === 'ADMIN' && input.managerId !== undefined) managerId = input.managerId
    if (managerId === target.id) throw new ValidationError('A user cannot be their own manager')
    if (managerId) {
      const manager = await this.requireAccess(actor, managerId)
      if (manager.role !== 'ADMIN' && manager.role !== 'MANAGER') throw new ValidationError('Assigned manager must have MANAGER or ADMIN role')
    }
    target = this.schedule({ ...target, name: input.name.trim(), email, role, managerId }, input)
    return this.response(await this.repositories.saveUser(target))
  }

  async assignManager(actor: User, targetId: string, managerId: string | null): Promise<object> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only administrators can assign managers')
    const target = await this.requireAccess(actor, targetId)
    if (target.role === 'ADMIN') throw new ValidationError('Administrators cannot have a manager')
    if (managerId === target.id) throw new ValidationError('A user cannot be their own manager')
    if (managerId) {
      const manager = await this.requireAccess(actor, managerId)
      if (!['ADMIN', 'MANAGER'].includes(manager.role)) throw new ValidationError('Assigned manager must have MANAGER or ADMIN role')
    }
    return this.response(await this.repositories.saveUser({ ...target, managerId }))
  }

  response(user: User): object {
    return {
      id: user.id, name: user.name, email: user.email, role: user.role,
      managerId: user.managerId, managerName: user.managerName, createdById: user.createdById,
      workStartDate: user.workStartDate, dailyWorkloadMinutes: user.dailyWorkloadMinutes,
      standardEntryTime: user.standardEntryTime, standardExitTime: user.standardExitTime,
      lunchEnabled: user.lunchEnabled, lunchDurationMinutes: user.lunchDurationMinutes, workDays: user.workDays,
    }
  }

  scheduleResponse(user: User): object {
    const response = this.response(user) as Record<string, unknown>
    delete response.id; delete response.name; delete response.email; delete response.role
    delete response.managerId; delete response.managerName; delete response.createdById
    return response
  }
}
