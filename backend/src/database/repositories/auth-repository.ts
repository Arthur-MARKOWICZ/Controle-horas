import type { Pool } from 'pg'
import { RefreshTokenReuseError, UnauthorizedError } from '../../shared/errors.js'
import type { DatabaseClient } from './database-client.js'

export interface RefreshTokenRecord {
  id: string; familyId: string; userId: string; tokenHash: string; expiresAt: Date
}

export interface BiometricCredentialRecord { id: string; userId: string; secretHash: string }

export interface PasswordResetTokenRecord { id: string; userId: string; tokenHash: string; expiresAt: Date }

export class AuthRepository {
  constructor(readonly pool: Pool) {}

  async createRefreshToken(record: RefreshTokenRecord, client: DatabaseClient = this.pool): Promise<void> {
    await client.query(
      `INSERT INTO auth_refresh_tokens(id,family_id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.id, record.familyId, record.userId, record.tokenHash, record.expiresAt],
    )
  }

  async createBiometricCredential(record: BiometricCredentialRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO mobile_biometric_credentials(id,user_id,secret_hash)
       VALUES ($1,$2,$3)`,
      [record.id, record.userId, record.secretHash],
    )
  }

  async useBiometricCredential(id: string, secretHash: string, email: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      `UPDATE mobile_biometric_credentials credential SET last_used_at=NOW()
       FROM users user_account
       WHERE credential.id=$1 AND credential.secret_hash=$2
         AND credential.revoked_at IS NULL
         AND user_account.id=credential.user_id AND user_account.email=$3
       RETURNING credential.user_id`,
      [id, secretHash, email],
    )
    return result.rows[0]?.user_id || null
  }

  async revokeBiometricCredential(id: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE mobile_biometric_credentials SET revoked_at=COALESCE(revoked_at,NOW())
       WHERE id=$1 AND user_id=$2`,
      [id, userId],
    )
  }

  async revokeAllBiometricCredentials(userId: string, client: DatabaseClient = this.pool): Promise<void> {
    await client.query(
      `UPDATE mobile_biometric_credentials SET revoked_at=COALESCE(revoked_at,NOW())
       WHERE user_id=$1`,
      [userId],
    )
  }

  async rotateRefreshToken(currentId: string, tokenHash: string, next: RefreshTokenRecord): Promise<string> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{
        id: string; family_id: string; user_id: string; token_hash: string; expires_at: Date; revoked_at: Date | null
      }>('SELECT id,family_id,user_id,token_hash,expires_at,revoked_at FROM auth_refresh_tokens WHERE id=$1 FOR UPDATE', [currentId])
      const current = result.rows[0]
      if (!current || current.token_hash.trim() !== tokenHash || current.expires_at <= new Date()) {
        throw new UnauthorizedError('Refresh token is invalid or expired')
      }
      if (current.revoked_at) {
        await client.query('UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE family_id=$1', [current.family_id])
        await client.query('COMMIT')
        throw new RefreshTokenReuseError()
      }
      await this.createRefreshToken(next, client)
      await client.query(
        'UPDATE auth_refresh_tokens SET revoked_at=NOW(),last_used_at=NOW(),replaced_by_id=$2 WHERE id=$1',
        [currentId, next.id],
      )
      await client.query('COMMIT')
      return current.user_id
    } catch (error) {
      if (!(error instanceof RefreshTokenReuseError)) await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async revokeRefreshFamily(id: string, tokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW())
       WHERE family_id=(SELECT family_id FROM auth_refresh_tokens WHERE id=$1 AND token_hash=$2)`,
      [id, tokenHash],
    )
  }

  async cleanupRefreshTokens(): Promise<void> {
    await this.pool.query(
      `DELETE FROM auth_refresh_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '30 days'`,
    )
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1', [userId, passwordHash])
  }

  async revokeAllRefreshTokens(userId: string, client: DatabaseClient = this.pool): Promise<void> {
    await client.query('UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1', [userId])
  }

  async createPasswordResetToken(record: PasswordResetTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4)`,
      [record.id, record.userId, record.tokenHash, record.expiresAt],
    )
  }

  async resetPasswordWithToken(tokenHash: string, passwordHash: string): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ user_id: string }>(
        `UPDATE password_reset_tokens SET used_at=NOW()
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING user_id`, [tokenHash],
      )
      const token = result.rows[0]
      if (!token) { await client.query('COMMIT'); return false }
      await client.query('UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1', [token.user_id, passwordHash])
      await this.revokeAllRefreshTokens(token.user_id, client)
      await this.revokeAllBiometricCredentials(token.user_id, client)
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async cleanupPasswordResetTokens(): Promise<void> {
    await this.pool.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day' OR used_at < NOW() - INTERVAL '1 day'`)
  }
}
