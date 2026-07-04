FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY database/package*.json ./database/
COPY backend/api/package*.json ./backend/api/
COPY backend/worker/package*.json ./backend/worker/
COPY frontend/package*.json ./frontend/
RUN npm ci --workspace=frontend

COPY frontend ./frontend

RUN npm run build -w frontend

FROM nginx:stable-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
# Add custom Nginx config to support React router SPA re-writes
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
