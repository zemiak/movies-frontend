# Build: typecheck + bundle.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: nginx serves dist/ and proxies /api/ to the backend ($MOVIES_API).
FROM nginx:1.28-alpine AS runtime
ENV MOVIES_API=http://movies.movies.svc.cluster.local:8096 \
    STREAM_BASE=
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
