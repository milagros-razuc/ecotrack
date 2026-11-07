FROM gcc:13

WORKDIR /src
COPY . ./

RUN g++ -std=c++17 -Wall -Wextra -pedantic \
    tests/firmware_recovery_policy_test.cpp \
    -o firmware_recovery_policy_test
RUN g++ -std=c++17 -Wall -Wextra -pedantic \
    tests/preferences_key_length_test.cpp \
    -o preferences_key_length_test

CMD ["sh", "-c", "./firmware_recovery_policy_test && ./preferences_key_length_test"]
