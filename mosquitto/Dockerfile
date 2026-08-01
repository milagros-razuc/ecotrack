FROM eclipse-mosquitto:2
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY config/acl.conf /mosquitto/config/acl.conf
COPY config/passwd /mosquitto/config/passwd
RUN chown mosquitto:mosquitto /mosquitto/config/passwd && chmod 0700 /mosquitto/config/passwd