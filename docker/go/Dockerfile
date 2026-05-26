FROM golang:1.24

WORKDIR /app

COPY go-api/go.mod .
COPY go-api/go.sum .

RUN go mod download

COPY go-api /app

EXPOSE 3000

CMD ["go", "run", "main.go"]
