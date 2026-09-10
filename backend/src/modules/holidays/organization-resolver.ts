import type { Repositories } from '../../database/repositories.js'
import type { User } from '../../domain/types.js'
import { NotFoundError } from '../../shared/errors.js'

const DEFAULT_MAX_ENTRIES = 5_000

/**
 * Resolves the organization a user belongs to.
 *
 * There is no organizations table: an organization is the root of the `created_by_id` tree,
 * the ADMIN created by public registration. The answer never changes for a given user, because
 * `created_by_id` is written once at creation and never updated, so it is cached without a TTL.
 */
export class OrganizationResolver {
  private readonly cache = new Map<string, string>()

  constructor(
    private readonly repositories: Repositories,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  async rootIdOf(user: User): Promise<string> {
    if (!user.createdById) return user.id
    const cached = this.cache.get(user.id)
    if (cached) return cached

    const rootId = await this.repositories.findOrganizationRootId(user.id)
    if (!rootId) throw new NotFoundError('Organization not found for this user')
    if (this.cache.size >= this.maxEntries) this.cache.clear()
    this.cache.set(user.id, rootId)
    return rootId
  }
}
