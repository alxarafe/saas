FROM gradle:8.7-jdk21 AS build

WORKDIR /app

COPY kotlin-api /app

RUN gradle installDist

FROM eclipse-temurin:21

WORKDIR /app

COPY --from=build /app/build/install/kotlin-api /app

EXPOSE 3000

CMD ["/app/bin/kotlin-api"]
