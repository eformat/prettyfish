FROM registry.access.redhat.com/ubi9/nodejs-22 AS builder

COPY package*.json .npmrc $HOME/
USER root
RUN npm install
COPY . $HOME/
RUN npm run build

FROM registry.access.redhat.com/ubi9/nginx-122

COPY --from=builder /opt/app-root/src/dist/client /opt/app-root/src

COPY <<'EOF' /opt/app-root/nginx.conf.template
worker_processes auto;
pid /tmp/nginx.pid;
error_log /var/log/nginx/error.log;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    access_log /var/log/nginx/access.log;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 8080;
        server_name _;
        root /opt/app-root/src;
        index index.html;

        location /relay/ {
            proxy_pass http://__RELAY_HOST__:__RELAY_PORT__;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_read_timeout 86400s;
        }

        location /mcp/ {
            proxy_pass http://__RELAY_HOST__:__RELAY_PORT__;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
EOF

USER root
COPY <<'SCRIPT' /opt/app-root/start.sh
#!/bin/sh
RELAY_HOST="${RELAY_SERVICE_HOST:-prettyfish-relay}"
RELAY_PORT="${RELAY_SERVICE_PORT:-8081}"
sed "s|__RELAY_HOST__|${RELAY_HOST}|g; s|__RELAY_PORT__|${RELAY_PORT}|g" \
    /opt/app-root/nginx.conf.template > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
SCRIPT

RUN chmod +x /opt/app-root/start.sh

USER 1001
EXPOSE 8080

CMD ["/opt/app-root/start.sh"]
