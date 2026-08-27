import { expect, test } from '@playwright/test'

const adminId = '00000000-0000-4000-8000-000000000001'
const employeeId = '00000000-0000-4000-8000-000000000002'

function response(data: unknown) {
  return { contentType: 'application/json', body: JSON.stringify({ success: true, message: 'OK', data }) }
}

test('admin creates a forgotten work log for an employee', async ({ page }) => {
  let submitted: { entryAt: string; exitAt: string } | null = null
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname === '/api/auth/refresh') {
      return route.fulfill(response({ token: 'admin-token', userId: adminId, name: 'Admin', email: 'admin@example.com', role: 'ADMIN', accessTokenExpiresAt: '2026-12-31T00:00:00Z', refreshTokenExpiresAt: '2026-12-31T00:00:00Z' }))
    }
    if (request.method() === 'GET' && url.pathname === '/api/users') {
      return route.fulfill(response([
        { id: adminId, name: 'Admin', email: 'admin@example.com', role: 'ADMIN' },
        { id: employeeId, name: 'Ana', email: 'ana@example.com', role: 'USER' },
      ]))
    }
    if (request.method() === 'GET' && url.pathname === `/api/users/${employeeId}/history`) {
      return route.fulfill(response({ startDate: '2026-08-01', endDate: '2026-08-31', totalWorkedMinutes: 0, totalBalanceMinutes: 0, hourBankMinutes: 0, days: [] }))
    }
    if (request.method() === 'POST' && url.pathname === `/api/users/${employeeId}/work-logs`) {
      submitted = request.postDataJSON() as { entryAt: string; exitAt: string }
      return route.fulfill(response({ id: '00000000-0000-4000-8000-000000000099', ...submitted, closeReason: 'EXIT' }))
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Not found', data: null }) })
  })

  await page.goto('/settings/work-logs')
  await expect(page.getByRole('heading', { name: 'Ajustes de ponto' })).toBeVisible()
  await page.locator('#adjustment-user').selectOption(employeeId)
  await page.getByLabel('Entrada').fill('2026-07-13T08:00')
  await page.getByLabel('Saída').fill('2026-07-13T17:00')
  await page.getByRole('button', { name: 'Criar registro' }).click()

  await expect(page.getByText('Registro criado.')).toBeVisible()
  expect(submitted).toEqual({ entryAt: '2026-07-13T11:00:00.000Z', exitAt: '2026-07-13T20:00:00.000Z' })
})

test('admin deletes a closed work log after confirmation', async ({ page }) => {
  const workLogId = '00000000-0000-4000-8000-000000000099'
  let deleted = false
  await page.route('**/api/**', async (route) => {
    const request = route.request(); const url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname === '/api/auth/refresh') {
      return route.fulfill(response({ token: 'admin-token', userId: adminId, name: 'Admin', email: 'admin@example.com', role: 'ADMIN', accessTokenExpiresAt: '2026-12-31T00:00:00Z', refreshTokenExpiresAt: '2026-12-31T00:00:00Z' }))
    }
    if (request.method() === 'GET' && url.pathname === '/api/users') {
      return route.fulfill(response([{ id: adminId, name: 'Admin', email: 'admin@example.com', role: 'ADMIN' }, { id: employeeId, name: 'Ana', email: 'ana@example.com', role: 'USER' }]))
    }
    if (request.method() === 'GET' && url.pathname === `/api/users/${employeeId}/history`) {
      return route.fulfill(response({ startDate: '2026-08-01', endDate: '2026-08-31', totalWorkedMinutes: 480, totalBalanceMinutes: 0, hourBankMinutes: 0, days: deleted ? [] : [{ date: '2026-08-10', workLogs: [{ id: workLogId, entryAt: '2026-08-10T11:00:00.000Z', exitAt: '2026-08-10T20:00:00.000Z', closeReason: 'EXIT' }] }] }))
    }
    if (request.method() === 'DELETE' && url.pathname === `/api/users/${employeeId}/work-logs/${workLogId}`) {
      deleted = true
      return route.fulfill(response(null))
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Not found', data: null }) })
  })

  await page.goto('/settings/work-logs')
  await page.locator('#adjustment-user').selectOption(employeeId)
  await expect(page.getByRole('button', { name: 'Excluir' })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Excluir' }).click()
  await expect(page.getByText('Registro excluído.')).toBeVisible()
  await expect(page.getByText('Nenhum registro encontrado neste mês.')).toBeVisible()
})
