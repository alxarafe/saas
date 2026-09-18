FROM golang:1.24 AS build

WORKDIR /app

COPY go-api/go.mod .
COPY go-api/go.sum .

RUN go mod download

COPY go-api ./

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app/api .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates curl

WORKDIR /app

COPY --from=build /app/api /app/api

EXPOSE 3000

CMD ["/app/api"]