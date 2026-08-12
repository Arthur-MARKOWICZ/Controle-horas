# Frontend web

SPA React/TypeScript estrita. O access token permanece em memória e o refresh token é gerenciado pela API em cookie `HttpOnly`.

```powershell
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Em desenvolvimento separado, defina `VITE_API_BASE_URL`. No container Nginx a URL fica vazia para usar a mesma origem e o proxy `/api`.
