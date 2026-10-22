FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libzip-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

RUN sed -ri 's/:80>/:3000>/; s/^Listen 80/Listen 3000/' \
        /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf \
    && a2enmod headers

COPY download-py.conf /etc/apache2/conf-enabled/download-py.conf
COPY app/          /var/www/html/
COPY lib/          /var/www/lib/
COPY upload.php    /var/www/upload.php
COPY entrypoint.sh /usr/local/bin/challenge-entrypoint

RUN chmod 0755 /usr/local/bin/challenge-entrypoint \
    && chown -R root:root /var/www/html /var/www/lib /var/www/upload.php \
    && find /var/www/html -type f -exec chmod 0644 {} \; \
    && find /var/www/html -type d -exec chmod 0755 {} \; \
    && chown www-data:www-data /var/www/html \
    && mkdir -p /var/www/storage \
    && chown -R www-data:www-data /var/www/storage

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD php -r "exit(@file_get_contents('http://127.0.0.1:3000/login.php')?0:1);"

ENTRYPOINT ["/usr/local/bin/challenge-entrypoint"]
CMD ["apache2-foreground"]
