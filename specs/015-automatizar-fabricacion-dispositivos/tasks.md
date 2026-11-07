# Tasks: Automatizar fabricación de dispositivos

## Phase 1 - Contract and safety tests

- [X] T001 Documentar en tests los parámetros obligatorios (`--firmware`, `--partitions` y demás), rutas externas y rechazo de carpetas dentro del repositorio.
- [X] T002 Añadir tests de no exposición con tokens y secretos sintéticos, capturando stdout, stderr, logs y archivos versionados sin imprimirlos ni persistirlos.
- [X] T003 Añadir tests del flujo de importación que aborten cuando los insertados no coincidan con la cantidad solicitada.
- [X] T004 Añadir tests del orden particiones `0x8000`, aplicación `0x10000`, NVS `0x9000` al final, tamaño `0x5000`, prohibición de `erase_flash` y no escritura de NVS tras fallo previo.
- [X] T005 Añadir tests de detección con `Get-CimInstance Win32_SerialPort`, selección explícita mediante `--port` y rechazo cuando hay varios puertos.
- [ ] T006 Añadir tests de la consulta SQL de solo lectura mediante `docker compose exec`, sus estados y códigos de salida sin tocar los tests de enrolamiento.
- [ ] T007 Añadir test Windows que verifique con `icacls` que el archivo de tokens queda restringido al usuario actual.
- [ ] T008 Añadir tarea de verificación hardware que cubra `flash_id` y tabla de particiones decodificada, incluyendo NVS `0x9000`/`0x5000`.

## Phase 2 - Fabrication command

- [X] T009 Implementar el comando único con cantidad, host, carpeta de salida, `--firmware` y `--partitions`, reutilizando la generación existente.
- [X] T010 Implementar copia/importación/borrado mediante `docker cp`, `docker compose exec` y el contenedor `ecotrack_backend`.
- [X] T011 Implementar validación de insertados esperados antes de tokens y flasheo.
- [X] T012 Implementar generación individual de tokens y almacenamiento protegido fuera del repositorio sin impresión.
- [X] T013 Implementar ACL restringida con `icacls` y verificación de permisos.
- [X] T014 Implementar etiquetas mínimas por dispositivo con `device_id`, sin credenciales SoftAP.

## Phase 3 - CLI flashing and verification

- [X] T015 Implementar detección/selección del puerto con `Get-CimInstance Win32_SerialPort`, exigir `--port` si hay varios y resolver el `esptool.exe` real bajo `%LOCALAPPDATA%\Arduino15\packages\esp32\tools\esptool_py\<versión>\`.
- [X] T016 Implementar flasheo con `esptool.exe write-flash` en orden particiones `0x8000`, aplicación `0x10000`, NVS `0x9000`, sin `erase_flash`.
- [X] T017 Implementar espera y comprobación opcional mediante SQL de solo lectura por `docker compose exec`, sin modificar el backend.
- [ ] T018 Documentar la resolución del `esptool.exe` real de Arduino IDE, su versión verificada, `write-flash`, ACL `icacls` y la verificación hardware.

## Phase 4 - Validation and documentation

- [ ] T019 Ejecutar tests desde el host con Node >= 20 y `TEST_DATABASE_URL` en `ecotrack_test`.
- [ ] T020 Actualizar README con el comando real, parámetros, permisos, orden de flasheo y límites de alcance.
- [ ] T021 Verificar que no se modificaron enrolamiento, reclamo ni Dynamic Security y revisar `git diff --check`.
