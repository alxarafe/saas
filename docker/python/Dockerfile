FROM python:3.13-slim

WORKDIR /app

COPY python-api/requirements.txt .

RUN pip install -r requirements.txt

COPY python-api /app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
