FROM gcc:13

WORKDIR /src
COPY FirmwareRecoveryPolicy.h ./
COPY tests/firmware_recovery_policy_test.cpp tests/

RUN g++ -std=c++17 -Wall -Wextra -pedantic \
    tests/firmware_recovery_policy_test.cpp \
    -o firmware_recovery_policy_test

CMD ["./firmware_recovery_policy_test"]
