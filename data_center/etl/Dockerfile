FROM python:3.14-slim

WORKDIR /app

RUN pip install --no-cache-dir "psycopg[binary]" "pymongo"

COPY . .

CMD ["python", "-u", "sync_service.py"]
