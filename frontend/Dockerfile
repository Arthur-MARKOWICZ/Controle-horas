# Build context must be this directory (frontend).
#
# Local:
#   docker build -t controle-horas-frontend .
#
# Render:
#   Dockerfile Path  = frontend/Dockerfile
#   Docker Context   = frontend
#   (or Root Directory = frontend)

# Build
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Runtime
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
