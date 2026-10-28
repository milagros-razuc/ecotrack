FROM eclipse-mosquitto:2
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY config/acl.conf /mosquitto/config/acl.conf
COPY config/passwd /mosquitto/config/passwd
COPY config/certs/ecotrack-ca.crt /mosquitto/config/certs/ecotrack-ca.crt
COPY config/certs/broker.crt /mosquitto/config/certs/broker.crt
RUN chown mosquitto:mosquitto /mosquitto/config/acl.conf /mosquitto/config/passwd /mosquitto/config/certs/ecotrack-ca.crt /mosquitto/config/certs/broker.crt && \
    chmod 0700 /mosquitto/config/acl.conf /mosquitto/config/passwd && \
    chmod 0644 /mosquitto/config/certs/ecotrack-ca.crt /mosquitto/config/certs/broker.crt