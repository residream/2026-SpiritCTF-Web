#!/bin/sh
set -eu

if [ -z "${FLAG:-}" ]; then
    printf '%s\n' 'FLAG is required and must not be empty' >&2
    exit 1
fi

flag_value=$FLAG
unset FLAG

umask 077
printf '%s' "$flag_value" > /tmp/flag
unset flag_value

exec "$@"
