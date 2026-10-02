#pragma once

#include <Arduino.h>

#include "DeviceConfig.h"

// Formulario local disponible solo durante el aprovisionamiento.
bool startSetupPortal(const String& apName, DeviceConfig& config, void (*connectWifi)());
void pollSetupPortal();
void stopSetupPortal();
bool setupPortalActive();
void setupPortalStatus(const String& message);
