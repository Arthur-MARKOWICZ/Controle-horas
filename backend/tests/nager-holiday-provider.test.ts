import { describe, expect, it, vi } from 'vitest'
import { NagerHolidayProvider } from '../src/modules/holidays/nager-holiday-provider.js'

function respond(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function provider(fetchImpl: typeof fetch): NagerHolidayProvider {
  return new NagerHolidayProvider('https://holidays.example', 1_000, fetchImpl)
}

describe('NagerHolidayProvider', () => {
  it('requests the year endpoint of the configured country', async () => {
    const fetchImpl = vi.fn(async () => respond([])) as unknown as typeof fetch
    await provider(fetchImpl).fetchYear(2026, 'BR')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://holidays.example/api/v3/PublicHolidays/2026/BR',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('maps a country wide holiday to a national entry', async () => {
    const fetchImpl = (async () => respond([
      { date: '2026-09-07', localName: 'Independência do Brasil', name: 'Independence Day', global: true, counties: null },
    ])) as unknown as typeof fetch
    expect(await provider(fetchImpl).fetchYear(2026, 'BR')).toEqual([
      {
        date: '2026-09-07', name: 'Independência do Brasil', externalKey: 'Independence Day',
        subdivisionCode: null, scope: 'NATIONAL',
      },
    ])
  })

  it('expands counties into one subdivision entry each', async () => {
    const fetchImpl = (async () => respond([
      { date: '2026-07-09', localName: 'Revolução', name: 'Revolution', global: false, counties: ['BR-SP', 'BR-RJ'] },
    ])) as unknown as typeof fetch
    const result = await provider(fetchImpl).fetchYear(2026, 'BR')
    expect(result).toHaveLength(2)
    expect(result.map((entry) => entry.subdivisionCode)).toEqual(['BR-SP', 'BR-RJ'])
    expect(result.every((entry) => entry.scope === 'SUBDIVISION')).toBe(true)
  })

  it('treats an entry without counties as national even when it is not flagged global', async () => {
    const fetchImpl = (async () => respond([
      { date: '2026-01-01', localName: 'Confraternização', name: 'New Year', global: false, counties: null },
    ])) as unknown as typeof fetch
    const result = await provider(fetchImpl).fetchYear(2026, 'BR')
    expect(result[0]?.scope).toBe('NATIONAL')
  })

  it('falls back to the english name when the localised name is missing', async () => {
    const fetchImpl = (async () => respond([
      { date: '2026-01-01', name: 'New Year', global: true },
    ])) as unknown as typeof fetch
    expect((await provider(fetchImpl).fetchYear(2026, 'BR'))[0]?.name).toBe('New Year')
  })

  it('discards malformed entries instead of failing the whole year', async () => {
    const fetchImpl = (async () => respond([
      { date: 'not-a-date', name: 'Broken', global: true },
      { date: '2026-01-01', name: '', global: true },
      { date: '2026-09-07', localName: 'Válido', name: 'Valid', global: true },
    ])) as unknown as typeof fetch
    const result = await provider(fetchImpl).fetchYear(2026, 'BR')
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Válido')
  })

  it('ignores county codes that do not look like subdivisions', async () => {
    const fetchImpl = (async () => respond([
      { date: '2026-07-09', localName: 'Estadual', name: 'Regional', global: false, counties: ['nope', 'BR-SP'] },
    ])) as unknown as typeof fetch
    const result = await provider(fetchImpl).fetchYear(2026, 'BR')
    expect(result.map((entry) => entry.subdivisionCode)).toEqual(['BR-SP'])
  })

  it('reports a failing status as an external service error', async () => {
    const fetchImpl = (async () => respond(null, 500)) as unknown as typeof fetch
    await expect(provider(fetchImpl).fetchYear(2026, 'BR')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('reports a network failure as an external service error', async () => {
    const fetchImpl = (async () => { throw new Error('connect ETIMEDOUT') }) as unknown as typeof fetch
    await expect(provider(fetchImpl).fetchYear(2026, 'BR')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('reports a non-array payload as an external service error', async () => {
    const fetchImpl = (async () => respond({ unexpected: true })) as unknown as typeof fetch
    await expect(provider(fetchImpl).fetchYear(2026, 'BR')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('reports invalid json as an external service error', async () => {
    const fetchImpl = (async () => ({
      ok: true, status: 200, json: async () => { throw new Error('bad json') },
    })) as unknown as typeof fetch
    await expect(provider(fetchImpl).fetchYear(2026, 'BR')).rejects.toMatchObject({ statusCode: 502 })
  })
})
