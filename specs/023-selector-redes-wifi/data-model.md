# Data Model: Selección de redes WiFi

No se agregan tablas, claves NVS ni datos persistentes. El resultado del escaneo es temporal y contiene SSID únicos para llenar el control de selección. El SSID elegido o escrito manualmente sigue viajando en el formulario existente y solo se persiste cuando concluye con éxito el flujo vigente de configuración.
