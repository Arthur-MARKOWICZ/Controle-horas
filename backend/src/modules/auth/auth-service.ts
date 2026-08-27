import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Repositories, RefreshTokenRecord } from '../../database/repositories.js'
import type { User } from '../../domain/types.js'
import { ConflictError, InvalidCredentialsError, UnauthorizedError, ValidationError } from '../../shared/errors.js'
import type { UserService } from '../users/user-service.js'
import type { PasswordResetEmailSender } from './email-sender.js'

interface JwtClaims { sub: string; jti: string; type: 'access' | 'refresh'; family?: string; exp?: number }
export interface JwtCodec { sign(payload: Record<string, unknown>, options: { expiresIn: number }): string; verify(token: string): JwtClaims }

export interface SessionResponse {
  token: string; userId: string; name: string; email: string; role: string
  accessTokenExpiresAt: string; refreshToken?: string; refreshTokenExpiresAt: string
}

export interface BiometricCredentialResponse {
  credentialId: string
  credentialSecret: string
  email: string
}

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex') }

export class AccessTokenDenylist {
  private readonly tokens = new Map<string, number>()
  revoke(jti: string, expirationSeconds: number): void { this.cleanup(); this.tokens.set(jti, expirationSeconds * 1_000) }
  has(jti: string): boolean { this.cleanup(); return (this.tokens.get(jti) || 0) > Date.now() }
  private cleanup(): void { for (const [id, expiration] of this.tokens) if (expiration <= Date.now()) this.tokens.delete(id) }
}

export class AuthService {
  constructor(
    private readonly repositories: Repositories,
    private readonly users: UserService,
    private readonly accessJwt: JwtCodec,
    private readonly refreshJwt: JwtCodec,
    private readonly accessTtl: number,
    private readonly refreshTtl: number,
    private readonly bcryptRounds: number,
    readonly denylist: AccessTokenDenylist,
    private readonly emailSender: PasswordResetEmailSender | null = null,
    private readonly publicAppUrl: string | null = null,
  ) {}

  async register(input: { name: string; email: string; password: string }, includeRefresh: boolean): Promise<SessionResponse> {
    const email = input.email.trim().toLowerCase()
    if (await this.repositories.emailExists(email)) throw new ConflictError('Email is already registered')
    const user = await this.repositories.createUser({
      name: input.name.trim(), email, passwordHash: await bcrypt.hash(input.password, this.bcryptRounds), role: 'ADMIN',
      managerId: null, createdById: null, workStartDate: null, dailyWorkloadMinutes: 0,
      standardEntryTime: null, standardExitTime: null, lunchEnabled: false, lunchDurationMinutes: 0, workDays: [],
    })
    return this.createSession(user, includeRefresh)
  }

  async login(input: { email: string; password: string }, includeRefresh: boolean): Promise<SessionResponse> {
    const user = await this.repositories.findUserByEmail(input.email.trim().toLowerCase())
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new InvalidCredentialsError()
    return this.createSession(user, includeRefresh)
  }

  async createBiometricCredential(user: User): Promise<BiometricCredentialResponse> {
    const credentialId = randomUUID()
    const credentialSecret = randomBytes(32).toString('base64url')
    await this.repositories.createBiometricCredential({
      id: credentialId, userId: user.id, secretHash: hashToken(credentialSecret),
    })
    return { credentialId, credentialSecret, email: user.email }
  }

  async biometricLogin(
    input: { email: string; credentialId: string; credentialSecret: string },
    includeRefresh: boolean,
  ): Promise<SessionResponse> {
    const userId = await this.repositories.useBiometricCredential(
      input.credentialId, hashToken(input.credentialSecret), input.email.trim().toLowerCase(),
    )
    if (!userId) throw new UnauthorizedError('Biometric credentials are invalid')
    return this.createSession(await this.users.byId(userId), includeRefresh)
  }

  async revokeBiometricCredential(user: User, credentialId: string): Promise<void> {
    await this.repositories.revokeBiometricCredential(credentialId, user.id)
  }

  async refresh(token: string, includeRefresh: boolean): Promise<SessionResponse> {
    let claims: JwtClaims
    try { claims = this.refreshJwt.verify(token) } catch { throw new UnauthorizedError('Refresh token is invalid or expired') }
    if (claims.type !== 'refresh' || !claims.family) throw new UnauthorizedError('Refresh token is invalid or expired')
    const next = this.signRefresh(claims.sub, claims.family)
    const userId = await this.repositories.rotateRefreshToken(claims.jti, hashToken(token), next.record)
    if (userId !== claims.sub) throw new UnauthorizedError('Refresh token is invalid')
    const user = await this.users.byId(userId)
    const access = this.signAccess(user.id)
    return this.response(user, access, next, includeRefresh)
  }

  async logout(accessToken: string | null, refreshToken: string | null): Promise<void> {
    if (accessToken) {
      try {
        const claims = this.accessJwt.verify(accessToken)
        if (claims.type === 'access' && claims.exp) this.denylist.revoke(claims.jti, claims.exp)
      } catch { /* Invalid token is already unusable. */ }
    }
    if (refreshToken) {
      try {
        const claims = this.refreshJwt.verify(refreshToken)
        if (claims.type === 'refresh') await this.repositories.revokeRefreshFamily(claims.jti, hashToken(refreshToken))
      } catch { /* Logout remains idempotent. */ }
    }
  }

  verifyAccess(token: string): JwtClaims {
    let claims: JwtClaims
    try { claims = this.accessJwt.verify(token) } catch { throw new UnauthorizedError('Access token is invalid or expired') }
    if (claims.type !== 'access' || this.denylist.has(claims.jti)) throw new UnauthorizedError('Access token is invalid or expired')
    return claims
  }

  async changePassword(user: User, currentPassword: string, newPassword: string): Promise<void> {
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new InvalidCredentialsError()
    await this.repositories.updatePassword(user.id, await bcrypt.hash(newPassword, this.bcryptRounds))
    await this.repositories.revokeAllRefreshTokens(user.id)
    await this.repositories.revokeAllBiometricCredentials(user.id)
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    if (!this.emailSender || !this.publicAppUrl) throw new ValidationError('Password reset email is not configured')
    const user = await this.repositories.findUserByEmail(emailInput.trim().toLowerCase())
    if (!user) return
    const token = randomBytes(32).toString('base64url')
    await this.repositories.cleanupPasswordResetTokens()
    await this.repositories.createPasswordResetToken({
      id: randomUUID(), userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1_000),
    })
    await this.emailSender.sendPasswordReset({ recipient: user.email, resetUrl: `${this.publicAppUrl}/reset-password?token=${encodeURIComponent(token)}` })
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const reset = await this.repositories.resetPasswordWithToken(hashToken(token), await bcrypt.hash(newPassword, this.bcryptRounds))
    if (!reset) throw new ValidationError('Password reset link is invalid or expired')
  }

  private async createSession(user: User, includeRefresh: boolean): Promise<SessionResponse> {
    await this.repositories.cleanupRefreshTokens()
    const access = this.signAccess(user.id)
    const refresh = this.signRefresh(user.id, randomUUID())
    await this.repositories.createRefreshToken(refresh.record)
    return this.response(user, access, refresh, includeRefresh)
  }

  private signAccess(userId: string): { token: string; expiresAt: Date } {
    const jti = randomUUID(); const expiresAt = new Date(Date.now() + this.accessTtl * 1_000)
    return { token: this.accessJwt.sign({ sub: userId, jti, type: 'access' }, { expiresIn: this.accessTtl }), expiresAt }
  }

  private signRefresh(userId: string, familyId: string): { token: string; expiresAt: Date; record: RefreshTokenRecord } {
    const id = randomUUID(); const expiresAt = new Date(Date.now() + this.refreshTtl * 1_000)
    const token = this.refreshJwt.sign({ sub: userId, jti: id, type: 'refresh', family: familyId }, { expiresIn: this.refreshTtl })
    return { token, expiresAt, record: { id, familyId, userId, tokenHash: hashToken(token), expiresAt } }
  }

  private response(
    user: User, access: { token: string; expiresAt: Date },
    refresh: { token: string; expiresAt: Date }, includeRefresh: boolean,
  ): SessionResponse {
    const response: SessionResponse = {
      token: access.token, userId: user.id, name: user.name, email: user.email, role: user.role,
      accessTokenExpiresAt: access.expiresAt.toISOString(), refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    }
    if (includeRefresh) response.refreshToken = refresh.token
    return response
  }
}
