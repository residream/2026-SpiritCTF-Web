#!/bin/sh
set -eu

if [ -z "${FLAG:-}" ]; then
    printf '%s\n' 'FLAG is required and must not be empty' >&2
    exit 1
fi

flag_value=$FLAG
unset FLAG
umask 077
printf '%s' "$flag_value" > /flag
chown www-data:www-data /flag
chmod 0400 /flag
unset flag_value

token=$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')
printf '%s' "$token" > /var/www/upload_token
chown www-data:www-data /var/www/upload_token
chmod 0440 /var/www/upload_token
cp /var/www/upload.php "/var/www/html/upload_${token}.php"
chmod 0644 "/var/www/html/upload_${token}.php"
unset token

exec "$@"
