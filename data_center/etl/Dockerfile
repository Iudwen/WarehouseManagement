FROM python:3.14-slim

WORKDIR /app

RUN pip install --no-cache-dir "psycopg[binary]"

COPY sync_service.py .

CMD ["python", "-u", "sync_service.py"]