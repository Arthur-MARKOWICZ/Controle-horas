# Estado de segurança da reescrita TypeScript

Atualizado em 11/08/2026.

- Access JWT de 15 minutos; refresh JWT rotacionado, revogável e persistido somente como SHA-256.
- Logout revoga a família de refresh e mantém denylist do access token em memória até a expiração.
- Web usa access em memória e cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`.
- Mobile usa `SecureStore`; a biometria protege uma credencial aleatória por aparelho, persistida no servidor somente como SHA-256, e solicita uma sessão nova.
- Login e cadastro: dez tentativas por 15 minutos, por IP/rota/e-mail.
- SQL parametrizado, pool máximo cinco e importação limitada a 2 MB/5.000 linhas.
- Backend e frontend: `npm audit --omit=dev` sem vulnerabilidades conhecidas em 11/08/2026.

O Expo 53 ainda herda seis alertas altos do pacote `image-size` pela cadeia Metro. O reparo automático do npm exige uma troca incompatível do React Native. O pacote participa do toolchain/bundler, não do processamento de uploads da API. Atualize quando houver uma versão suportada pelo Expo e não use arquivos de imagem não confiáveis no processo de build.

Por decisão explícita do projeto, produção usa HTTP e `COOKIE_SECURE=false`. Isso permite interceptação de senhas e tokens na rede; cookies `HttpOnly` e `SameSite` não substituem HTTPS.
