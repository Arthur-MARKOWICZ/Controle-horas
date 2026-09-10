import { describe, expect, it, vi } from 'vitest'
import type { Repositories } from '../src/database/repositories.js'
import type { User } from '../src/domain/types.js'
import { OrganizationResolver } from '../src/modules/holidays/organization-resolver.js'

function user(id: string, createdById: string | null): User {
  return { id, createdById } as User
}

function repositories(findOrganizationRootId: unknown): Repositories {
  return { findOrganizationRootId } as unknown as Repositories
}

describe('OrganizationResolver', () => {
  it('treats a user without a creator as their own organization root', async () => {
    const findOrganizationRootId = vi.fn()
    const resolver = new OrganizationResolver(repositories(findOrganizationRootId))
    expect(await resolver.rootIdOf(user('root', null))).toBe('root')
    // The cheap case must not reach the database at all.
    expect(findOrganizationRootId).not.toHaveBeenCalled()
  })

  it('walks the creation tree for a created user', async () => {
    const findOrganizationRootId = vi.fn().mockResolvedValue('root')
    const resolver = new OrganizationResolver(repositories(findOrganizationRootId))
    expect(await resolver.rootIdOf(user('child', 'parent'))).toBe('root')
    expect(findOrganizationRootId).toHaveBeenCalledWith('child')
  })

  it('caches the answer because created_by_id never changes', async () => {
    const findOrganizationRootId = vi.fn().mockResolvedValue('root')
    const resolver = new OrganizationResolver(repositories(findOrganizationRootId))
    await resolver.rootIdOf(user('child', 'parent'))
    await resolver.rootIdOf(user('child', 'parent'))
    expect(findOrganizationRootId).toHaveBeenCalledTimes(1)
  })

  it('clears the cache instead of growing without bound', async () => {
    const findOrganizationRootId = vi.fn().mockResolvedValue('root')
    const resolver = new OrganizationResolver(repositories(findOrganizationRootId), 2)
    await resolver.rootIdOf(user('a', 'parent'))
    await resolver.rootIdOf(user('b', 'parent'))
    await resolver.rootIdOf(user('c', 'parent'))
    await resolver.rootIdOf(user('a', 'parent'))
    expect(findOrganizationRootId).toHaveBeenCalledTimes(4)
  })

  it('fails when the tree has no root', async () => {
    const resolver = new OrganizationResolver(repositories(vi.fn().mockResolvedValue(null)))
    await expect(resolver.rootIdOf(user('child', 'parent'))).rejects.toMatchObject({ statusCode: 404 })
  })
})
