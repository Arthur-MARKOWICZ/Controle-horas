import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'

const mode = __ENV.LOAD_MODE || 'guarantee-10'
const baseUrl = __ENV.LOAD_BASE_URL || 'http://nginx'
const password = 'LoadTestPassword123'
const businessSuccess = new Rate('business_success')
const businessFailures = new Counter('business_failures')
const historyPeriod = 'startDate=2026-08-01&endDate=2026-08-31&limit=10&offset=0'
const guaranteeDuration = __ENV.LOAD_GUARANTEE_DURATION || '5m'

const capacityStages = []
for (let index = 1; index <= 10; index++) capacityStages.push({ target: index * 10, duration: '2m' })

export const options = {
  scenarios: {
    users: mode === 'capacity'
      ? { executor: 'ramping-vus', startVUs: 0, stages: capacityStages, gracefulRampDown: '5s' }
      : { executor: 'constant-vus', vus: 10, duration: guaranteeDuration, gracefulStop: '5s' },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' }],
    business_success: [{ threshold: 'rate>0.99', abortOnFail: true, delayAbortEval: '30s' }],
    'http_req_duration{operation:dashboard}': ['p(95)<2000'],
    'http_req_duration{operation:history}': ['p(95)<2000'],
    'http_req_duration{operation:entry}': ['p(95)<2000'],
    'http_req_duration{operation:exit}': ['p(95)<2000'],
  },
}

let token

function emailForVirtualUser() {
  return `load-user-${String(__VU).padStart(3, '0')}@load.invalid`
}

function request(method, path, operation, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = http.request(method, `${baseUrl}${path}`, body && JSON.stringify(body), {
    headers: headers,
    tags: { operation },
  })
  const successful = check(response, {
    [`${operation} returns a successful API envelope`]: (result) => result.status >= 200 && result.status < 300 && result.json('success') === true,
  })
  businessSuccess.add(successful)
  if (!successful) businessFailures.add(1)
  return successful ? response : null
}

function login() {
  const response = request('POST', '/api/auth/mobile/login', 'login', { email: emailForVirtualUser(), password })
  token = response && response.json('data.token')
  return Boolean(token)
}

function recordWorkLogCycle() {
  if (!request('POST', '/api/work-logs/entry', 'entry')) return
  request('POST', '/api/work-logs/exit', 'exit')
}

export default function () {
  if (!token && !login()) return
  const choice = Math.random()
  if (choice < 0.7) request('GET', '/api/dashboard/today', 'dashboard')
  else if (choice < 0.9) request('GET', `/api/history?${historyPeriod}`, 'history')
  else recordWorkLogCycle()
  sleep(1)
}

export function handleSummary(data) {
  const metric = (name) => (data.metrics[name] && data.metrics[name].values) || {}
  const thresholds = []
  Object.keys(data.metrics).forEach((name) => {
    const rules = data.metrics[name].thresholds || {}
    Object.keys(rules).forEach((rule) => {
      const result = rules[rule]
      const passed = typeof result === 'object' ? result.ok : result
      thresholds.push(`| ${name}: ${rule} | ${passed ? 'aprovado' : 'falhou'} |`)
    })
  })
  const lines = [
    '# Resultado do teste de carga',
    '',
    `Modo: ${mode}`,
    `Duração configurada: ${mode === 'capacity' ? 'rampa de 10 a 100 usuários, 2 min por estágio' : `10 usuários por ${guaranteeDuration}`}`,
    '',
    '| Métrica | Valor |', '| --- | --- |',
    `| Requisições | ${metric('http_reqs').count || 0} |`,
    `| Falhas HTTP | ${((metric('http_req_failed').rate || 0) * 100).toFixed(2)}% |`,
    `| Sucesso de negócio | ${((metric('business_success').rate || 0) * 100).toFixed(2)}% |`,
    `| p95 geral | ${(metric('http_req_duration')['p(95)'] || 0).toFixed(2)} ms |`,
    `| Falhas de negócio | ${metric('business_failures').count || 0} |`,
    `| Máximo de VUs | ${metric('vus_max').max || 0} |`,
    '',
    '## Thresholds',
    '',
    '| Regra | Resultado |', '| --- | --- |',
  ]
  Array.prototype.push.apply(lines, thresholds.length ? thresholds : ['| Nenhum threshold reportado | — |'])
  lines.push('', 'Consulte summary.json para métricas por operação e container-stats.jsonl para CPU/RAM.')
  const markdown = lines.join('\n')
  return { stdout: `${markdown}\n`, '/results/summary.md': markdown }
}
