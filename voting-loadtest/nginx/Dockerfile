FROM nginx:1.27-alpine
# Самоподписанный сертификат создаётся при сборке образа: ключи не хранятся в репозитории.
RUN apk add --no-cache openssl \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=voting.local" \
      -keyout /etc/nginx/key.pem -out /etc/nginx/cert.pem
COPY nginx.conf /etc/nginx/nginx.conf
