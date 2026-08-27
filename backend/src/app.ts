import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { Pool } from 'pg'
import type { AppConfig } from './config.js'
import { loadConfig } from './config.js'
import { createPool } from './database/pool.js'
import { Repositories } from './database/repositories.js'
import type { User } from './domain/types.js'
import { ok } from './domain/types.js'
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from './shared/errors.js'
import { AuthService, AccessTokenDenylist, type SessionResponse } from './modules/auth/auth-service.js'
import { SmtpPasswordResetEmailSender } from './modules/auth/email-sender.js'
import { UserService, type ManagedUserInput, type ScheduleInput } from './modules/users/user-service.js'
import { WorkTimeService } from './modules/work-logs/work-time-service.js'
import { WorkLogService } from './modules/work-logs/work-log-service.js'
import { HistoryService } from './modules/history/history-service.js'
import { FileService } from './modules/files/file-service.js'

declare module 'fastify' {
  interface FastifyRequest { authUser: User | null }
}

declare module '@fastify/jwt' {
  interface FastifyJWT { namespaces: 'access' | 'refresh' }
}

interface BuildOptions { config?: AppConfig; pool?: Pool; logger?: boolean }
interface LoginBody { email: string; password: string }
interface RegisterBody extends LoginBody { name: string }
interface RefreshBody { refreshToken: string }
interface ManagerBody { managerId: string | null }
interface HistoryQuery { startDate: string; endDate: string; limit?: string; offset?: string }
interface AdministrativeWorkLogBody { entryAt: string; exitAt: string }
interface ChangePasswordBody { currentPassword: string; newPassword: string }
interface RequestPasswordResetBody { email: string }
interface ResetPasswordBody { token: string; newPassword: string }

const responseSchema = {
  type: 'object', required: ['success', 'message', 'data'],
  properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: {} },
} as const

const authRateLimit = {
  max: 10, timeWindow: '15 minutes',
  keyGenerator: (request: FastifyRequest) => {
    const email = (request.body as Partial<LoginBody> | undefined)?.email?.trim().toLowerCase() || ''
    return `${request.ip}|${request.routeOptions.url}|${email}`
  },
}

const loginSchema = {
  body: {
    type: 'object', additionalProperties: false, required: ['email', 'password'],
    properties: { email: { type: 'string', format: 'email', maxLength: 255 }, password: { type: 'string', minLength: 1, maxLength: 72 } },
  }, response: { 200: responseSchema },
}

const registerSchema = {
  body: {
    type: 'object', additionalProperties: false, required: ['name', 'email', 'password'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 }, email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 72, pattern: '^(?=.*[A-Za-z])(?=.*\\d).+$' },
    },
  }, response: { 201: responseSchema },
}

const strongPassword = { type: 'string', minLength: 8, maxLength: 72, pattern: '^(?=.*[A-Za-z])(?=.*\\d).+$' }

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

function withoutRefresh(session: SessionResponse): { response: Omit<SessionResponse, 'refreshToken'>; refreshToken: string } {
  if (!session.refreshToken) throw new Error('Session did not contain a refresh token')
  const { refreshToken, ...response } = session
  return { response, refreshToken }
}

function integerQuery(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) throw new ValidationError('Pagination values must be integers')
  return parsed
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const config = options.config || loadConfig()
  const pool = options.pool || createPool(config)
  const app = Fastify({
    logger: options.logger === false ? false : { level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.refreshToken'] },
    trustProxy: 1, bodyLimit: 2 * 1024 * 1024 + 64 * 1024,
  })
  app.decorateRequest('authUser', null)

  await app.register(cookie)
  await app.register(cors, {
    origin: config.corsAllowedOrigins.length ? config.corsAllowedOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  })
  await app.register(helmet, { contentSecurityPolicy: false, strictTransportSecurity: false })
  await app.register(multipart, { limits: { files: 1, fileSize: 2 * 1024 * 1024, parts: 2 } })
  await app.register(rateLimit, { global: false })
  await app.register(jwt, { secret: config.jwtAccessSecret, namespace: 'access' })
  await app.register(jwt, { secret: config.jwtRefreshSecret, namespace: 'refresh' })
  if (config.openApiEnabled) {
    await app.register(swagger, { openapi: { info: { title: 'Controle de Horas API', version: '1.0.0' } } })
    await app.register(swaggerUi, { routePrefix: '/swagger-ui' })
  }

  const jwtNamespaces = app.jwt
  const repositories = new Repositories(pool)
  const users = new UserService(repositories, config.bcryptRounds)
  const auth = new AuthService(
    repositories, users, jwtNamespaces.access, jwtNamespaces.refresh,
    config.jwtAccessTtlSeconds, config.jwtRefreshTtlSeconds, config.bcryptRounds, new AccessTokenDenylist(),
    config.smtpUrl && config.smtpFrom ? new SmtpPasswordResetEmailSender(config.smtpUrl, config.smtpFrom) : null,
    config.publicAppUrl,
  )
  const workTime = new WorkTimeService(config.timeZone)
  const workLogs = new WorkLogService(repositories, workTime, config.timeZone)
  const history = new HistoryService(repositories, workTime, config.timeZone)
  const files = new FileService(repositories, users, history, config.timeZone)

  app.addHook('onRoute', (routeOptions) => {
    const url = routeOptions.url
    const binaryResponse = url.includes('/export.') || url.includes('/template.')
    if (url.startsWith('/api/') && !binaryResponse) {
      const schema = (routeOptions.schema || {}) as Record<string, unknown>
      const responses = (schema.response || {}) as Record<string, unknown>
      routeOptions.schema = { ...schema, response: { '2xx': responseSchema, ...responses } }
    }
  })

  const authenticate = async (request: FastifyRequest): Promise<void> => {
    const token = bearer(request)
    if (!token) throw new UnauthorizedError()
    const claims = auth.verifyAccess(token)
    request.authUser = await users.byId(claims.sub)
  }
  const actor = (request: FastifyRequest): User => {
    if (!request.authUser) throw new UnauthorizedError()
    return request.authUser
  }
  const setRefreshCookie = (reply: FastifyReply, token: string): void => {
    reply.setCookie('refresh_token', token, {
      path: '/api/auth', httpOnly: true, sameSite: 'strict', secure: config.cookieSecure,
      maxAge: config.jwtRefreshTtlSeconds,
    })
  }
  const clearRefreshCookie = (reply: FastifyReply): void => {
    reply.clearCookie('refresh_token', { path: '/api/auth', httpOnly: true, sameSite: 'strict', secure: config.cookieSecure })
  }

  app.get('/health', async () => ({ status: 'UP' }))
  app.get('/actuator/health', async () => ({ status: 'UP' }))
  app.get('/ready', async () => { await pool.query('SELECT 1'); return { status: 'UP' } })
  if (config.openApiEnabled) {
    app.get('/v3/api-docs', async () => app.swagger())
    app.get('/swagger-ui.html', async (_request, reply) => reply.redirect('/swagger-ui/'))
  }

  app.post<{ Body: RegisterBody }>('/api/auth/register', {
    schema: registerSchema, config: { rateLimit: authRateLimit },
  }, async (request, reply) => {
    const session = await auth.register(request.body, true)
    const result = withoutRefresh(session); setRefreshCookie(reply, result.refreshToken)
    return reply.code(201).send(ok('User registered successfully', result.response))
  })
  app.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: loginSchema, config: { rateLimit: authRateLimit },
  }, async (request, reply) => {
    const result = withoutRefresh(await auth.login(request.body, true)); setRefreshCookie(reply, result.refreshToken)
    return ok('Login successful', result.response)
  })
  app.post('/api/auth/refresh', async (request, reply) => {
    const token = request.cookies.refresh_token
    if (!token) throw new UnauthorizedError('Refresh token is required')
    const result = withoutRefresh(await auth.refresh(token, true)); setRefreshCookie(reply, result.refreshToken)
    return ok('Session refreshed successfully', result.response)
  })
  app.post('/api/auth/logout', async (request, reply) => {
    await auth.logout(bearer(request), request.cookies.refresh_token || null); clearRefreshCookie(reply)
    return ok('Logout successful', null)
  })
  app.post<{ Body: RequestPasswordResetBody }>('/api/auth/password-reset/request', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['email'], properties: { email: { type: 'string', format: 'email', maxLength: 255 } } } },
    config: { rateLimit: authRateLimit },
  }, async (request) => {
    await auth.requestPasswordReset(request.body.email)
    return ok('If this email is registered, a password reset link has been sent', null)
  })
  app.post<{ Body: ResetPasswordBody }>('/api/auth/password-reset/confirm', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['token', 'newPassword'], properties: { token: { type: 'string', minLength: 32, maxLength: 256 }, newPassword: strongPassword } } },
    config: { rateLimit: authRateLimit },
  }, async (request) => {
    await auth.resetPassword(request.body.token, request.body.newPassword)
    return ok('Password reset successfully', null)
  })
  app.post<{ Body: ChangePasswordBody }>('/api/auth/password', {
    preHandler: authenticate,
    schema: { body: { type: 'object', additionalProperties: false, required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 72 }, newPassword: strongPassword } } },
  }, async (request, reply) => {
    await auth.changePassword(actor(request), request.body.currentPassword, request.body.newPassword)
    const token = bearer(request)
    if (token) await auth.logout(token, request.cookies.refresh_token || null)
    clearRefreshCookie(reply)
    return ok('Password changed successfully. Sign in again to continue', null)
  })

  app.post<{ Body: RegisterBody }>('/api/auth/mobile/register', {
    schema: registerSchema, config: { rateLimit: authRateLimit },
  }, async (request, reply) => reply.code(201).send(ok('User registered successfully', await auth.register(request.body, true))))
  app.post<{ Body: LoginBody }>('/api/auth/mobile/login', {
    schema: loginSchema, config: { rateLimit: authRateLimit },
  }, async (request) => ok('Login successful', await auth.login(request.body, true)))
  app.post<{ Body: RefreshBody }>('/api/auth/mobile/refresh', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['refreshToken'], properties: { refreshToken: { type: 'string', minLength: 1 } } } },
  }, async (request) => ok('Session refreshed successfully', await auth.refresh(request.body.refreshToken, true)))
  app.post<{ Body: RefreshBody }>('/api/auth/mobile/logout', async (request) => {
    await auth.logout(bearer(request), request.body?.refreshToken || null)
    return ok('Logout successful', null)
  })

  app.get('/api/users/me', { preHandler: authenticate }, async (request) => ok('Current user retrieved successfully', users.currentUser(actor(request))))
  app.put<{ Body: ScheduleInput }>('/api/users/me/daily-workload', {
    preHandler: authenticate,
    schema: { body: scheduleSchema() },
  }, async (request) => ok('Daily workload updated successfully', await users.updateOwnSchedule(actor(request), request.body)))

  app.get('/api/dashboard/today', { preHandler: authenticate }, async (request) => ok('Dashboard retrieved successfully', await workLogs.dashboard(actor(request))))
  for (const action of ['entry', 'pause', 'lunch', 'resume', 'exit'] as const) {
    app.post(`/api/work-logs/${action}`, { preHandler: authenticate }, async (request) => {
      const data = await workLogs.register(actor(request), action)
      return ok(`${action[0]!.toUpperCase()}${action.slice(1)} registered successfully`, data)
    })
  }

  app.get<{ Querystring: HistoryQuery }>('/api/history', { preHandler: authenticate }, async (request) => {
    const { startDate, endDate } = request.query
    return ok('History retrieved successfully', await history.get(
      actor(request), startDate, endDate, integerQuery(request.query.limit, 90), integerQuery(request.query.offset, 0),
    ))
  })
  app.get<{ Querystring: HistoryQuery }>('/api/history/export.xlsx', { preHandler: authenticate }, async (request, reply) => {
    const content = await files.exportExcel(actor(request), request.query.startDate, request.query.endDate)
    return reply.header('Content-Disposition', 'attachment; filename="historico-horas.xlsx"')
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(content)
  })
  app.get<{ Querystring: HistoryQuery }>('/api/history/export.pdf', { preHandler: authenticate }, async (request, reply) => {
    const content = await files.exportPdf(actor(request), request.query.startDate, request.query.endDate)
    return reply.header('Content-Disposition', 'attachment; filename="historico-horas.pdf"').type('application/pdf').send(content)
  })

  app.get('/api/users', { preHandler: authenticate }, async (request) => ok('Users retrieved successfully', await users.list(actor(request))))
  app.post<{ Body: ManagedUserInput }>('/api/users', {
    preHandler: authenticate, schema: { body: managedUserSchema(true) },
  }, async (request, reply) => reply.code(201).send(ok('User created successfully', await users.create(actor(request), request.body))))
  app.put<{ Params: { userId: string }; Body: ManagedUserInput }>('/api/users/:userId', {
    preHandler: authenticate, schema: { params: idParams(), body: managedUserSchema(false) },
  }, async (request) => ok('User updated successfully', await users.update(actor(request), request.params.userId, request.body)))
  app.put<{ Params: { userId: string }; Body: ManagerBody }>('/api/users/:userId/manager', {
    preHandler: authenticate,
    schema: { params: idParams(), body: { type: 'object', additionalProperties: false, required: ['managerId'], properties: { managerId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] } } } },
  }, async (request) => ok('Manager assigned successfully', await users.assignManager(actor(request), request.params.userId, request.body.managerId)))
  app.get<{ Params: { userId: string } }>('/api/users/:userId/dashboard', {
    preHandler: authenticate, schema: { params: idParams() },
  }, async (request) => ok('Dashboard retrieved successfully', await workLogs.dashboard(await users.requireAccess(actor(request), request.params.userId))))
  app.get<{ Params: { userId: string }; Querystring: HistoryQuery }>('/api/users/:userId/history', {
    preHandler: authenticate, schema: { params: idParams() },
  }, async (request) => ok('History retrieved successfully', await history.get(
    await users.requireAccess(actor(request), request.params.userId), request.query.startDate, request.query.endDate,
    integerQuery(request.query.limit, 90), integerQuery(request.query.offset, 0),
  )))

  const requireAdminWorkLogAccess = async (request: FastifyRequest<{ Params: { userId: string } }>): Promise<User> => {
    await authenticate(request)
    if (actor(request).role !== 'ADMIN') throw new ForbiddenError('Only administrators can adjust work logs')
    return users.requireAccess(actor(request), request.params.userId)
  }
  const requireHourBankRecalculationAccess = async (request: FastifyRequest<{ Params: { userId: string } }>): Promise<User> => {
    await authenticate(request)
    if (!['ADMIN', 'MANAGER'].includes(actor(request).role)) {
      throw new ForbiddenError('Only administrators and managers can recalculate hour banks')
    }
    return users.requireAccess(actor(request), request.params.userId)
  }
  app.post<{ Params: { userId: string } }>('/api/users/:userId/hour-bank/recalculate', {
    preHandler: requireHourBankRecalculationAccess, schema: { params: idParams() },
  }, async (request) => ok('Hour bank recalculated successfully', await workLogs.recalculateHourBank(
    await users.requireAccess(actor(request), request.params.userId),
  )))
  app.post<{ Params: { userId: string }; Body: AdministrativeWorkLogBody }>('/api/users/:userId/work-logs', {
    preHandler: requireAdminWorkLogAccess, schema: { params: idParams(), body: administrativeWorkLogSchema() },
  }, async (request) => ok('Work log created successfully', await workLogs.createAdministrative(
    await users.requireAccess(actor(request), request.params.userId), new Date(request.body.entryAt), new Date(request.body.exitAt),
  )))
  app.put<{ Params: { userId: string; workLogId: string }; Body: AdministrativeWorkLogBody }>('/api/users/:userId/work-logs/:workLogId', {
    preHandler: requireAdminWorkLogAccess, schema: { params: workLogParams(), body: administrativeWorkLogSchema() },
  }, async (request) => ok('Work log updated successfully', await workLogs.updateAdministrative(
    await users.requireAccess(actor(request), request.params.userId), request.params.workLogId, new Date(request.body.entryAt), new Date(request.body.exitAt),
  )))
  app.delete<{ Params: { userId: string; workLogId: string }}>('/api/users/:userId/work-logs/:workLogId', {
    preHandler: requireAdminWorkLogAccess, schema: { params: workLogParams() },
  }, async (request) => {
    await workLogs.deleteAdministrative(await users.requireAccess(actor(request), request.params.userId), request.params.workLogId)
    return ok('Work log deleted successfully', null)
  })

  const requireAdmin = async (request: FastifyRequest): Promise<void> => {
    await authenticate(request)
    if (actor(request).role !== 'ADMIN') throw new ForbiddenError('Only administrators can import work logs')
  }
  app.get('/api/migrations/template.csv', { preHandler: requireAdmin }, async (_request, reply) => {
    return reply.header('Content-Disposition', 'attachment; filename="work-logs-template.csv"').type('text/csv').send(files.csvTemplate())
  })
  app.get('/api/migrations/template.xlsx', { preHandler: requireAdmin }, async (_request, reply) => {
    return reply.header('Content-Disposition', 'attachment; filename="work-logs-template.xlsx"')
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await files.xlsxTemplate())
  })
  app.post('/api/migrations/import', { preHandler: requireAdmin }, async (request) => {
    const part = await request.file({ limits: { files: 1, fileSize: 2 * 1024 * 1024 } })
    if (!part) throw new ValidationError('File is required')
    return ok('Import finished', await files.importFile(actor(request), part.filename, await part.toBuffer()))
  })

  app.setErrorHandler((unknownError, request, reply) => {
    const error = unknownError as FastifyError & { validation?: Array<{ message?: string }> }
    let status = 500; let message = 'An unexpected error occurred'
    if (error instanceof AppError) { status = error.statusCode; message = error.message }
    else if (error.validation) { status = 400; message = error.validation.map((item) => item.message || 'Invalid value').join('; ') }
    else if (error.statusCode === 413 || error.code === 'FST_REQ_FILE_TOO_LARGE') { status = 413; message = 'File exceeds maximum size of 2 MB' }
    else if ((error as { code?: string }).code === '23505') { status = 409; message = 'The operation conflicts with existing data.' }
    else if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) { status = error.statusCode; message = error.message }
    if (status >= 500) request.log.error({ err: error }, 'Unhandled request error')
    return reply.code(status).send({ success: false, message, data: null })
  })

  app.addHook('onClose', async () => { if (!options.pool) await pool.end() })
  return app
}

function idParams(): object {
  return { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } }
}

function workLogParams(): object {
  return { type: 'object', required: ['userId', 'workLogId'], properties: {
    userId: { type: 'string', format: 'uuid' }, workLogId: { type: 'string', format: 'uuid' },
  } }
}

function administrativeWorkLogSchema(): object {
  return {
    type: 'object', additionalProperties: false, required: ['entryAt', 'exitAt'],
    properties: { entryAt: { type: 'string', format: 'date-time' }, exitAt: { type: 'string', format: 'date-time' } },
  }
}

function scheduleSchema(): object {
  return {
    type: 'object', additionalProperties: false,
    properties: {
      standardEntryTime: { anyOf: [{ type: 'string', pattern: '^\\d{2}:\\d{2}(?::\\d{2})?$' }, { type: 'null' }] },
      standardExitTime: { anyOf: [{ type: 'string', pattern: '^\\d{2}:\\d{2}(?::\\d{2})?$' }, { type: 'null' }] },
      lunchEnabled: { type: 'boolean' }, lunchDurationMinutes: { type: 'integer', minimum: 0, maximum: 240 },
      workDays: { type: 'array', uniqueItems: true, items: { type: 'string', enum: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] } },
      workStartDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
    },
  }
}

function managedUserSchema(create: boolean): object {
  return {
    ...scheduleSchema() as Record<string, unknown>,
    required: create ? ['name', 'email', 'password', 'role'] : ['name'],
    properties: {
      ...(scheduleSchema() as { properties: object }).properties,
      name: { type: 'string', minLength: 1, maxLength: 120 }, email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 72, pattern: '^(?=.*[A-Za-z])(?=.*\\d).+$' },
      role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'USER'] },
      managerId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    },
  }
}
