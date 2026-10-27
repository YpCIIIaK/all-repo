FROM grafana/k6:1.3.0
# root и iproute2 нужны, чтобы добавить задержку и потери сети (tc netem) внутри контейнера k6.
USER root
RUN apk add --no-cache iproute2
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
