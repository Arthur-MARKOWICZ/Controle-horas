# Build from repository root:
#   docker build -f back-end/Controle_horas/Dockerfile -t controle-horas-backend .
#
# On Render: Dockerfile Path = back-end/Controle_horas/Dockerfile
#            Root Directory  = (empty / repository root)

# Build
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY back-end/Controle_horas/pom.xml .
RUN mvn -B dependency:go-offline

COPY back-end/Controle_horas/src ./src
RUN mvn -B -DskipTests package

# Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=build /app/target/Controle_horas-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
