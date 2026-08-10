# Frontend web

Aplicação React/Vite mantida no repositório, mas temporariamente fora do deploy de produção. Ela não é publicada na VM Oracle nem no Cloudflare.

## Desenvolvimento local

Copie `.env.example` para `.env.local`, mantenha `VITE_API_BASE_URL=http://localhost:8080` e execute:

```powershell
npm ci
npm run dev
```

## Testes e build

```powershell
npm test
npm run lint
npm run build
```

## Produção

Não existe atualmente um comando ou workflow de publicação do frontend. Quando uma hospedagem for definida, configure `VITE_API_BASE_URL` com a URL pública do backend e restaure um pipeline específico para essa plataforma.
