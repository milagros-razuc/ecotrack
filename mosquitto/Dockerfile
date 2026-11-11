FROM eclipse-mosquitto:2
COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY config/acl.conf /mosquitto/config/acl.conf
COPY config/certs/ecotrack-ca.crt /mosquitto/config/certs/ecotrack-ca.crt
COPY config/dynamic-security.json.example /mosquitto/config/dynamic-security.json.example
RUN plugin="$(find /usr /lib -type f -name mosquitto_dynamic_security.so -print -quit)"; \
    if [ -z "$plugin" ]; then echo "mosquitto_dynamic_security.so was not found in the base image" >&2; exit 1; fi; \
    cp "$plugin" /mosquitto/config/mosquitto_dynamic_security.so; \
    chown mosquitto:mosquitto /mosquitto/config/acl.conf /mosquitto/config/dynamic-security.json.example /mosquitto/config/mosquitto_dynamic_security.so && \
    chmod 0700 /mosquitto/config/acl.conf && \
    chmod 0644 /mosquitto/config/dynamic-security.json.example /mosquitto/config/mosquitto_dynamic_security.so
