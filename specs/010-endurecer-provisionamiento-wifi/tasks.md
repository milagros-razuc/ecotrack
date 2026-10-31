---
description: "Task list for hardening ESP32 WiFi provisioning"
---

# Tasks: Endurecer aprovisionamiento WiFi

**Input**: Design documents from `specs/010-endurecer-provisionamiento-wifi/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included because the feature explicitly requires automated checks, firmware compilation, secret scans, and reproducible real-device validation.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently after the foundational firmware and manufacturing interfaces are available.

## Phase 1: Setup

**Purpose**: Establish ignored manufacturing output paths and the Python test entry point without changing the backend.

- [X] T001 [P] Add ignored paths for factory CSV, labels, NVS images, and local firmware build outputs in `.gitignore`
- [X] T002 [P] Create the Python manufacturing script entry point and test layout in `scripts/provision_factory.py` and `tests/provision_factory_test.py`
- [ ] T003 [P] Record the selected Arduino IDE partition-scheme procedure and required `nvs_partition_gen.py` tooling in `README.MD`

---

## Phase 2: Foundational

**Purpose**: Define the shared NVS identity contract and preserve existing device/MQTT configuration boundaries before story implementation.

**CRITICAL**: User-story work depends on these contracts.

- [X] T004 Define factory identity fields and NVS keys `factoryReady`, `deviceId`, `softApPass`, and `deviceSecret` in `codigo-esp32-mosquitto/DeviceConfig.h`, preserving editable fields `ssid`, `wifiPassword`, `mqttHost`, `mqttUser`, and `mqttPassword`
- [X] T005 Implement atomic factory-identity read/write helpers with explicit incomplete-identity errors in `codigo-esp32-mosquitto/DeviceConfig.cpp`; a unit is not ready unless all three values exist and `factoryReady` confirms complete writing
- [X] T006 [P] Add the shared NVS image CSV schema and the `0x5000` partition-size configuration used by the manufacturing script in `scripts/factory_nvs.csv` and `scripts/factory_nvs_config.py`
- [X] T007 [P] Add a static regression check that rejects tracked default SoftAP passwords, device secrets, and production credentials in `tests/no_factory_secrets_test.py`
- [ ] T008 [P] Add firmware build and flash-evidence placeholders to the device validation procedure in `specs/010-endurecer-provisionamiento-wifi/quickstart.md`

**Checkpoint**: Factory identity can be represented in NVS, generated artifacts are ignored, and secret regression checks are runnable before story-specific changes.

---

## Phase 3: User Story 1 - Identidad única de fábrica (Priority: P1) 🎯 MVP

**Goal**: Generate a unique identity per device, produce loadable NVS plus operator records, and keep all generated secrets outside version control.

**Independent Test**: Generate two units, verify all three values differ and both NVS images are valid, load each image on its matching ESP32, verify the matching SoftAP key works and the other key fails, then run the repository secret scan.

### Tests for User Story 1

- [X] T009 [P] [US1] Test `secrets`-based generation, required lengths, allowed `device_id` characters, and per-device uniqueness in `tests/provision_factory_test.py`
- [X] T010 [P] [US1] Test duplicate prevention and atomic batch failure (no partial CSV/image output) in `tests/provision_factory_test.py`
- [X] T011 [P] [US1] Test CSV/label fields `device_id`, `softap_password`, `device_secret`, `nvs_image`, and `created_at` in `tests/provision_factory_test.py`
- [X] T012 [P] [US1] Test generated NVS contains `factoryReady=true`, `deviceId`, `softApPass`, and `deviceSecret`, and excludes WiFi/MQTT credentials in `tests/provision_factory_test.py`

### Implementation for User Story 1

- [X] T013 [US1] Implement Python CLI generation with `secrets`, batch uniqueness validation, output-directory safety, CSV/label emission, and `nvs_partition_gen.py` invocation in `scripts/provision_factory.py`
- [X] T014 [US1] Implement explicit failure cleanup and nonzero exit handling so generator errors never mark a unit prepared or leave partial manufacturing records in `scripts/provision_factory.py`
- [X] T015 [US1] Replace the firmware fallback identity path with factory NVS loading and validation in `codigo-esp32-mosquitto/DeviceConfig.cpp` and `codigo-esp32-mosquitto/DeviceConfig.h`
- [ ] T016 [US1] Remove the default SoftAP password macro and make the optional `softApPass` non-blocking for the open Spec 1A portal in `codigo-esp32-mosquitto/SetupPortal.cpp`, `codigo-esp32-mosquitto/SetupPortal.h`, and `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`
- [X] T017 [US1] Ensure factory `deviceId` remains the MQTT client identity and topic component without changing TLS port `8883`, Mosquitto ACL expectations, or payload format in `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`
- [ ] T018 [US1] Run Python tests, generated-artifact inspection, and repository secret scan; record two-device real-hardware evidence using `specs/010-endurecer-provisionamiento-wifi/quickstart.md`

**Checkpoint**: Two real devices have distinct factory identities, matching SoftAP keys, no repository defaults, and unchanged MQTT/TLS identity behavior.

---

## Phase 4: User Story 2 - Portal temporal y recuperable (Priority: P1)

**Goal**: Close the SoftAP after successful configuration or 10 minutes of inactivity, while preserving controlled BOOT recovery and clear errors.

**Independent Test**: On a real configured and unconfigured ESP32, verify boot provisioning, invalid-form retention, successful transition to station with SoftAP shutdown, BOOT hold for 3 seconds, and timeout shutdown within 10 minutes 30 seconds.

### Tests for User Story 2

- [X] T019 [P] [US2] Add host-side tests for portal timeout state transitions and activity-reset rules around `millis()` in `tests/setup_portal_state_test.cpp`
- [X] T020 [P] [US2] Add a firmware regression check that the successful-save path contains `WiFi.softAPdisconnect(true)` followed by `WiFi.mode(WIFI_STA)` in `tests/setup_portal_regression_test.py`

### Implementation for User Story 2

- [ ] T037 [US2] Replace the protected SoftAP with an open temporary SoftAP, preserve DNSServer, 10-minute absolute timeout, and BOOT recovery in `codigo-esp32-mosquitto/SetupPortal.cpp` and `codigo-esp32-mosquitto/SetupPortal.h`
- [ ] T038 [US2] Add six-digit PIN unlock, five-attempt/5-minute lockout, and mandatory authentication for `/save` without serializing secrets in `codigo-esp32-mosquitto/SetupPortal.cpp` and `codigo-esp32-mosquitto/SetupPortalPage.h`

- [X] T021 [US2] Add a 10-minute inactivity deadline, activity timestamp reset, and explicit expiry status handling using `millis()` in `codigo-esp32-mosquitto/SetupPortal.cpp` and `codigo-esp32-mosquitto/SetupPortal.h`
- [X] T022 [US2] Update portal request handlers so valid configuration activity resets the timeout, invalid/incomplete input leaves the portal active, and status responses remain explicit in `codigo-esp32-mosquitto/SetupPortal.cpp` and `codigo-esp32-mosquitto/SetupPortalPage.h`
- [X] T023 [US2] Close the SoftAP immediately after confirmed WiFi/MQTT/TLS configuration with `WiFi.softAPdisconnect(true)` and `WiFi.mode(WIFI_STA)` in `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`
- [X] T024 [US2] Ensure unconfigured boot and BOOT hold of at least 3 seconds open the portal with the loaded per-device password without reopening it for shorter presses in `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`
- [ ] T025 [US2] Run the portal regression tests and execute the real-device boot, invalid-save, successful-save, BOOT, and 10-minute timeout scenarios with evidence recorded in `specs/010-endurecer-provisionamiento-wifi/quickstart.md`

**Checkpoint**: The portal is protected, temporary, explicitly closed on success/timeout, and recoverable only through the defined physical action.

---

## Phase 5: User Story 3 - Preparación de firmware para actualización futura (Priority: P2)

**Goal**: Install the two-app-slot plus LittleFS/Minimal SPIFFS layout without OTA and prove flash usage and existing TLS/MQTT compatibility.

**Independent Test**: Reflash one ESP32 over USB with the selected scheme, reload its NVS image, verify the reported flash percentage, boot and publish over TLS 8883, and confirm the current MQTT JSON and ACL behavior.

### Tests for User Story 3

- [X] T026 [P] [US3] Add a static partition/configuration check for two application slots, LittleFS/Minimal SPIFFS, and absence of OTA implementation in `tests/partition_scheme_test.py`
- [X] T027 [P] [US3] Add a compatibility regression check for port `8883`, topic `ecotrack/<deviceId>/lecturas`, and current payload fields in `tests/mqtt_compatibility_test.py`

### Implementation for User Story 3

- [ ] T039 [US1] Load `setupPin` and `serverHost` from factory NVS, allow optional `softApPass`, and validate the new identity contract in `codigo-esp32-mosquitto/DeviceConfig.cpp`
- [ ] T040 [US1] Extend factory provisioning with validated `--server-host`, generated six-digit `setupPin`, namespace-first NVS rows, and PIN/server label output in `scripts/provision_factory.py`
- [ ] T041 [US1] Add regression coverage for namespace ordering, new NVS keys, PIN lockout, open SoftAP, and the absolute portal timeout in `tests/provision_factory_test.py` and `tests/setup_portal_regression_test.py`

- [X] T028 [US3] Select and configure the Arduino ESP32 partition scheme in `partitions.csv` with NVS `0x5000`, two application slots of `0x1E0000`, and LittleFS/Minimal SPIFFS, documenting the exact board-menu choice or local scheme file in `README.MD`
- [X] T029 [US3] Remove any firmware fallback that depends on compiled production credentials and ensure the new partition/NVS layout still loads factory identity in `codigo-esp32-mosquitto/DeviceConfig.cpp`
- [X] T030 [US3] Add build-output instructions that record firmware flash bytes, partition capacity, and occupied percentage in `README.MD`
- [X] T031 [US3] Document mandatory USB reflashing, NVS-image reload order, configuration-loss expectations, and explicit non-implementation of OTA in `README.MD` and `specs/010-endurecer-provisionamiento-wifi/quickstart.md`
- [ ] T032 [US3] Compile and flash the firmware, run the partition/compatibility checks, and record real-device TLS 8883, ACL, topic, payload, and flash-usage evidence in `specs/010-endurecer-provisionamiento-wifi/quickstart.md`

**Checkpoint**: The device boots on the new layout, reports flash usage, has no OTA behavior, and preserves the deployed secure MQTT contract.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalize documentation, security evidence, and full validation without touching the backend.

- [ ] T033 [P] Update `README.MD` to remove instructions that imply production credentials are compiled into the sketch and link the factory provisioning and real-device validation procedure
- [ ] T034 [P] Update `docs/requisitos.md` and `docs/PROYECTO FINAL DE SISTEMAS-ECOTRACK.md` to reflect per-device SoftAP credentials, the 10-minute timeout, USB reflashing, and the unchanged TLS/MQTT contract
- [ ] T035 Run all Python/C++ host checks, `git diff --check`, tracked-secret search, and a backend change-scope check; resolve only regressions caused by this feature
- [ ] T036 Execute the complete [quickstart.md](quickstart.md) procedure on two real devices and archive non-secret evidence for each acceptance criterion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all story phases.
- **Phase 3 (US1)**: Depends on Phase 2 and is the recommended MVP.
- **Phase 4 (US2)**: Depends on the factory identity interface from Phase 2; can proceed in parallel with US1 after that interface is stable.
- **Phase 5 (US3)**: Depends on Phase 2; its final device validation depends on the identity loader from US1.
- **Phase 6 (Polish)**: Depends on all selected stories and their evidence.

### User Story Dependencies

- **US1 (P1)**: Foundational only; no dependency on US2 or US3.
- **US2 (P1)**: Foundational identity interface; uses the factory SoftAP password produced by US1's contract but its portal state logic is independently testable.
- **US3 (P2)**: Foundational partition/NVS contract; final compatibility validation uses the factory identity from US1.

### Parallel Opportunities

- Phase 1: T001, T002, and T003 can run in parallel.
- Phase 2: T006, T007, and T008 can run in parallel after T004/T005 contracts are agreed.
- US1 tests T009-T012 can run in parallel; T013-T014 can proceed in parallel with T015-T017 once the NVS contract is fixed.
- US2 T019-T020 can run in parallel; T021-T022 are portal-local work while T023-T024 are firmware integration work.
- US3 T026-T027 can run in parallel; T028-T031 are separable documentation/configuration tasks after scheme selection.
- US1 and US2 implementation can proceed in parallel after Phase 2 if one owner handles shared `DeviceConfig` integration carefully.

## Implementation Strategy

1. **MVP**: Complete Phase 1, Phase 2, and US1 through T018. This delivers unique factory identity, per-device SoftAP credentials, NVS images, operator records, and secret removal.
2. **Secure portal increment**: Complete US2 and validate success/timeout/BOOT behavior on real hardware.
3. **Flash preparation increment**: Complete US3, reflash by USB, reload NVS, and prove TLS/MQTT compatibility.
4. **Release hardening**: Complete Phase 6 only after all real-device evidence is captured and no generated secret artifacts are tracked.
