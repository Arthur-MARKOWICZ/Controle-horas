import type { HolidayRule, Repositories } from '../../database/repositories.js'
import type {
  HolidayCalendarResponse, HolidayDayResponse, HolidayRuleResponse, HolidaySyncResponse,
} from '../../domain/contracts.js'
import { holidayResponse } from '../../domain/contracts.js'
import type { Holiday, HolidayScope, User } from '../../domain/types.js'
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js'
import type { HolidayCalendar, HolidayCalendarSource } from '../../shared/holiday-calendar.js'
import { buildHolidayCalendar } from '../../shared/holiday-calendar.js'
import { compareDates, daysBetween } from '../../shared/time.js'
import type { UserService } from '../users/user-service.js'
import type { HolidaySyncService } from './holiday-sync-service.js'
import type { OrganizationResolver } from './organization-resolver.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_PERIOD_DAYS = 366
const MIN_SYNC_YEAR = 1900
const MAX_SYNC_YEAR = 2200
const MAX_RULE_TARGETS = 200
/**
 * How far a moved or bridged day off may sit from the holiday itself. Generous for any real
 * case (a bridge or a swap is always nearby) and tight enough to catch a mistyped year, which
 * would otherwise silently zero someone's workload on an unrelated date.
 */
const MAX_RULE_DATE_DISTANCE_DAYS = 30
const MANUAL_HOLIDAY_SCOPES: HolidayScope[] = ['MUNICIPAL', 'COMPANY']
const MAX_HOLIDAY_NAME_LENGTH = 160
const SUBDIVISION_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,7}$/
const MIN_HOLIDAY_YEAR = 2000
const MAX_HOLIDAY_YEAR = 2100

export interface ManualHolidayInput {
  date: string
  name: string
  scope: HolidayScope
  subdivisionCode?: string | null
}

export interface HolidayRuleInput {
  /** null targets the whole organization; an array targets those users individually. */
  userIds: string[] | null
  dayOff: boolean
  /** Moves the day off to this date; the holiday itself becomes a working day. */
  observedDate?: string | null
  /** An extra day off next to the holiday. */
  bridgeDate?: string | null
  notes?: string | null
}

/**
 * Whether a holiday is a day off when the company has not configured a rule for it.
 *
 * State level holidays from the provider are reported but do not stop the clock: only part of a
 * state observes some of them, so opting in has to be an explicit company decision.
 */
function defaultDayOff(scope: HolidayScope): boolean {
  return scope !== 'SUBDIVISION'
}

function ruleResponse(rule: HolidayRule): HolidayRuleResponse {
  return {
    id: rule.id,
    holidayId: rule.holidayId,
    holidayDate: rule.holidayDate,
    holidayName: rule.holidayName,
    userId: rule.userId,
    userName: rule.userName,
    dayOff: rule.dayOff,
    observedDate: rule.observedDate,
    bridgeDate: rule.bridgeDate,
    notes: rule.notes,
    createdByName: rule.createdByName,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }
}

function yearsBetween(startDate: string, endDate: string): number[] {
  const first = Number(startDate.slice(0, 4))
  const last = Number(endDate.slice(0, 4))
  const years: number[] = []
  for (let year = first; year <= last; year++) years.push(year)
  return years
}

export class HolidayService implements HolidayCalendarSource {
  constructor(
    private readonly repositories: Repositories,
    private readonly users: UserService,
    private readonly organizations: OrganizationResolver,
    private readonly sync: HolidaySyncService,
    private readonly countryCode: string,
  ) {}

  /**
   * Calendar used by the balance calculation.
   *
   * It reads the local catalogue and never synchronizes: an hour bank can span years, and
   * letting it trigger provider requests would turn a dashboard into a fan of external calls.
   * A year that was never synchronized simply has no holidays, which is how the system
   * behaved before this feature.
   */
  async calendarFor(user: User, startDate: string, endDate: string): Promise<HolidayCalendar> {
    return buildHolidayCalendar(await this.resolve(user, startDate, endDate))
  }

  async calendar(user: User, startDate: string, endDate: string): Promise<HolidayCalendarResponse> {
    this.validatePeriod(startDate, endDate)
    await this.sync.ensureYears(yearsBetween(startDate, endDate), this.countryCode)
    const calendar = buildHolidayCalendar(await this.resolve(user, startDate, endDate))
    // A moved or bridged day can fall outside the window its holiday belongs to.
    const days: HolidayDayResponse[] = calendar.days()
      .filter((day) => day.date >= startDate && day.date <= endDate)
      .map(holidayResponse)
    return { startDate, endDate, days }
  }

  /**
   * Registers a holiday the provider does not know about.
   *
   * Municipal holidays simply do not exist in Nager.Date, so they can only come from the company.
   * Like an organization-wide rule, this affects everyone, so it is restricted to the root
   * administrator: elsewhere in the system an ADMIN never reaches outside their own subtree.
   */
  async createHoliday(actor: User, input: ManualHolidayInput): Promise<HolidayDayResponse> {
    const organizationId = await this.organizations.rootIdOf(actor)
    this.requireOrganizationRule(actor, organizationId)

    const name = input.name?.trim()
    if (!name) throw new ValidationError('name is required')
    if (name.length > MAX_HOLIDAY_NAME_LENGTH) {
      throw new ValidationError(`name must not exceed ${MAX_HOLIDAY_NAME_LENGTH} characters`)
    }
    if (!DATE_PATTERN.test(input.date || '')) {
      throw new ValidationError('date is required in YYYY-MM-DD format')
    }
    const year = Number(input.date.slice(0, 4))
    if (year < MIN_HOLIDAY_YEAR || year > MAX_HOLIDAY_YEAR) {
      throw new ValidationError(`date must be between ${MIN_HOLIDAY_YEAR} and ${MAX_HOLIDAY_YEAR}`)
    }
    if (!MANUAL_HOLIDAY_SCOPES.includes(input.scope)) {
      throw new ValidationError(`scope must be one of ${MANUAL_HOLIDAY_SCOPES.join(', ')}`)
    }
    const subdivisionCode = input.subdivisionCode?.trim().toUpperCase() || null
    if (subdivisionCode && !SUBDIVISION_PATTERN.test(subdivisionCode)) {
      throw new ValidationError('subdivisionCode must follow the BR-SP format')
    }

    const holiday = await this.repositories.createManualHoliday({
      organizationId, countryCode: this.countryCode, subdivisionCode,
      date: input.date, name, scope: input.scope, createdById: actor.id,
    })
    return this.manualHolidayResponse(holiday)
  }

  async deleteHoliday(actor: User, holidayId: string): Promise<void> {
    const organizationId = await this.organizations.rootIdOf(actor)
    this.requireOrganizationRule(actor, organizationId)
    const removed = await this.repositories.deleteManualHoliday(holidayId, organizationId)
    // A synced holiday belongs to the shared catalogue and is not the company's to remove.
    if (!removed) throw new NotFoundError('Manual holiday not found')
  }

  async listRules(actor: User): Promise<HolidayRuleResponse[]> {
    this.requireRuleManager(actor)
    const organizationId = await this.organizations.rootIdOf(actor)
    // A manager only sees the organization-wide rules plus the ones about their own team.
    const userIds = actor.role === 'MANAGER' ? await this.teamIdsOf(actor) : null
    const rules = await this.repositories.findHolidayRules(organizationId, userIds)
    return rules.map(ruleResponse)
  }

  async saveRule(actor: User, holidayId: string, input: HolidayRuleInput): Promise<HolidayRuleResponse[]> {
    this.requireRuleManager(actor)
    const organizationId = await this.organizations.rootIdOf(actor)
    const holiday = await this.repositories.findHolidayById(holidayId)
    if (!holiday) throw new NotFoundError('Holiday not found')
    if (holiday.organizationId && holiday.organizationId !== organizationId) {
      throw new NotFoundError('Holiday not found')
    }
    if (typeof input.dayOff !== 'boolean') throw new ValidationError('dayOff is required')

    const targets = await this.resolveTargets(actor, organizationId, input.userIds)
    const notes = input.notes?.trim() || null
    if (notes && notes.length > 255) throw new ValidationError('notes must not exceed 255 characters')

    const observedDate = this.validateRuleDate(input.observedDate, holiday.date, 'observedDate')
    const bridgeDate = this.validateRuleDate(input.bridgeDate, holiday.date, 'bridgeDate')
    // Moving a day off that does not exist is meaningless; the database check agrees.
    if (observedDate && !input.dayOff) {
      throw new ValidationError('observedDate requires the holiday to count as a day off')
    }
    if (observedDate && observedDate === holiday.date) {
      throw new ValidationError('observedDate must differ from the holiday date')
    }

    const saved = await this.repositories.upsertHolidayRules(targets.map((userId) => ({
      organizationId, holidayId, userId, dayOff: input.dayOff, observedDate, bridgeDate, notes,
      createdById: actor.id, createdByName: actor.name,
    })))
    return saved.map(ruleResponse)
  }

  async deleteRule(actor: User, ruleId: string): Promise<void> {
    this.requireRuleManager(actor)
    const organizationId = await this.organizations.rootIdOf(actor)
    const rule = await this.repositories.findHolidayRuleById(ruleId)
    if (!rule || rule.organizationId !== organizationId) throw new NotFoundError('Holiday rule not found')
    // Removing an organization-wide rule affects everyone, so it follows the same gate as creating one.
    if (!rule.userId) this.requireOrganizationRule(actor, organizationId)
    else await this.users.requireAccess(actor, rule.userId)
    await this.repositories.deleteHolidayRule(ruleId, organizationId)
  }

  async resync(year: number): Promise<HolidaySyncResponse> {
    if (!Number.isInteger(year) || year < MIN_SYNC_YEAR || year > MAX_SYNC_YEAR) {
      throw new ValidationError(`year must be between ${MIN_SYNC_YEAR} and ${MAX_SYNC_YEAR}`)
    }
    const result = await this.sync.resync(year, this.countryCode)
    return {
      year: result.year,
      countryCode: this.countryCode,
      holidayCount: result.holidayCount,
      syncedAt: result.syncedAt.toISOString(),
    }
  }

  private async resolve(user: User, startDate: string, endDate: string) {
    const organizationId = await this.organizations.rootIdOf(user)
    const rows = await this.repositories.findResolvedHolidays(
      this.countryCode, organizationId, user.id, startDate, endDate,
    )
    return rows.map((row) => ({
      holiday: row.holiday,
      ruleId: row.ruleId,
      dayOff: row.ruleDayOff === null ? defaultDayOff(row.holiday.scope) : row.ruleDayOff,
      observedDate: row.ruleObservedDate,
      bridgeDate: row.ruleBridgeDate,
    }))
  }

  private manualHolidayResponse(holiday: Holiday): HolidayDayResponse {
    return holidayResponse({
      date: holiday.date, holiday, dayOff: defaultDayOff(holiday.scope), kind: 'HOLIDAY',
      ruleId: null, ruleObservedDate: null, ruleBridgeDate: null,
    })
  }

  private requireRuleManager(actor: User): void {
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      throw new ForbiddenError('Only administrators and managers can manage holiday rules')
    }
  }

  /**
   * An organization-wide rule changes the balance of people the actor may not even be able to
   * list, so it is restricted to the root administrator. Everywhere else in the system an ADMIN
   * only reaches their own subtree, and this keeps that invariant.
   */
  private requireOrganizationRule(actor: User, organizationId: string): void {
    if (actor.role !== 'ADMIN' || actor.id !== organizationId) {
      throw new ForbiddenError('Only the root administrator can manage organization-wide holiday rules')
    }
  }

  private async resolveTargets(actor: User, organizationId: string, userIds: string[] | null): Promise<Array<string | null>> {
    if (userIds === null) {
      this.requireOrganizationRule(actor, organizationId)
      return [null]
    }
    if (userIds.length === 0) throw new ValidationError('userIds must contain at least one user')
    if (userIds.length > MAX_RULE_TARGETS) {
      throw new ValidationError(`userIds must not exceed ${MAX_RULE_TARGETS} users`)
    }
    const unique = [...new Set(userIds)]
    for (const userId of unique) {
      const target = await this.users.requireAccess(actor, userId)
      const targetOrganizationId = await this.organizations.rootIdOf(target)
      if (targetOrganizationId !== organizationId) {
        throw new ForbiddenError('You do not have permission to access this user')
      }
    }
    return unique
  }

  private async teamIdsOf(actor: User): Promise<string[]> {
    const team = await this.repositories.listManagerTeam(actor.id)
    return team.map((member) => member.id)
  }

  private validateRuleDate(value: string | null | undefined, holidayDate: string, field: string): string | null {
    if (!value) return null
    if (!DATE_PATTERN.test(value)) throw new ValidationError(`${field} must follow the YYYY-MM-DD format`)
    if (Math.abs(daysBetween(holidayDate, value)) > MAX_RULE_DATE_DISTANCE_DAYS) {
      throw new ValidationError(`${field} must be within ${MAX_RULE_DATE_DISTANCE_DAYS} days of the holiday`)
    }
    return value
  }

  private validatePeriod(startDate: string, endDate: string): void {
    if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
      throw new ValidationError('startDate and endDate are required in YYYY-MM-DD format.')
    }
    if (compareDates(startDate, endDate) > 0) {
      throw new ValidationError('startDate must be less than or equal to endDate.')
    }
    // Bounded on purpose: every extra year in the range is one more provider request.
    if (daysBetween(startDate, endDate) + 1 > MAX_PERIOD_DAYS) {
      throw new ValidationError(`The period must not exceed ${MAX_PERIOD_DAYS} days.`)
    }
  }
}
