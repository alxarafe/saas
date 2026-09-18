FROM golang:1.24

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY go-api/go.mod .
COPY go-api/go.sum .

RUN go mod download

COPY go-api /app

EXPOSE 3000

CMD ["go", "run", "main.go"]
