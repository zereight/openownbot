FROM coturn/coturn:4.17.2-r0
COPY remote/coturn/turnserver.conf /etc/coturn/openownbot.conf
COPY remote/coturn/entrypoint.sh /usr/local/bin/openownbot-coturn
ENTRYPOINT ["/usr/local/bin/openownbot-coturn"]
