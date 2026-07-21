# Build context must be this directory (back-end/Controle_horas).
#
# Local:
#   docker build -t controle-horas-backend .
#
# Render:
#   Dockerfile Path  = back-end/Controle_horas/Dockerfile
#   Docker Context   = back-end/Controle_horas
#   (or Root Directory = back-end/Controle_horas)

# Build
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package

# Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=build /app/target/Controle_horas-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
