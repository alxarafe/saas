FROM php:8.4-cli-alpine

RUN apk add --no-cache \
    postgresql-dev \
    $PHPIZE_DEPS

RUN docker-php-ext-install pdo pdo_pgsql

WORKDIR /app

COPY php-api /app

EXPOSE 3000

CMD ["php", "-S", "0.0.0.0:3000", "-t", "public"]
