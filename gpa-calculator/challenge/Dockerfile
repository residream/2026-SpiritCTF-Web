FROM python:3.12-slim

ENV FLAG="flag{fake_for_local_test}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --disable-pip-version-check -r requirements.txt \
    && groupadd --gid 10001 challenge \
    && useradd --uid 10001 --gid challenge --no-create-home challenge

COPY app/ ./
COPY entrypoint.sh /usr/local/bin/challenge-entrypoint
RUN chmod 0755 /usr/local/bin/challenge-entrypoint

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/healthz', timeout=3).read()"

ENTRYPOINT ["/usr/local/bin/challenge-entrypoint"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:create_app()"]
