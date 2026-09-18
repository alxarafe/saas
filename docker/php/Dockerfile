FROM dunglas/frankenphp:1-php8.4-alpine

RUN apk add --no-cache postgresql-dev \
    && docker-php-ext-install pdo pdo_pgsql

COPY php-api /app

COPY docker/php/Caddyfile /etc/caddy/Caddyfile

WORKDIR /app

EXPOSE 3000

CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile"]