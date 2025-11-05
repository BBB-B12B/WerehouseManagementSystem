FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm ci

# Inject build-time environment variables with sensible defaults
ARG VITE_API_BASE_URL=http://localhost:8000/api
ARG VITE_R2_PUBLIC_BASE=https://r2.example
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_R2_PUBLIC_BASE=${VITE_R2_PUBLIC_BASE}

# Copy remaining source and build the static bundle
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache nginx
WORKDIR /usr/share/nginx/html

# Configure nginx to serve the static Vite bundle
RUN mkdir -p /run/nginx /etc/nginx/conf.d /etc/nginx/http.d && \
    rm -rf /etc/nginx/conf.d/* /etc/nginx/http.d/* && \
    cat <<'NGINX_CONF' > /etc/nginx/http.d/default.conf
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
NGINX_CONF

# Remove default nginx static assets and replace with Vite build artifacts
RUN rm -rf ./*
COPY --from=builder /app/dist ./

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
