const API_PATH_PREFIX = '/api/'

function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith(API_PATH_PREFIX)
}

function createUpstreamRequest(request, apiOrigin) {
  const requestUrl = new URL(request.url)
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin)
  const headers = new Headers(request.headers)
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  headers.delete('host')

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (isApiRequest(url)) {
      return fetch(createUpstreamRequest(request, env.API_ORIGIN))
    }

    return env.ASSETS.fetch(request)
  },
}
