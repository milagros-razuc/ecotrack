#pragma once

// 1: Azure producción. 0: configuración local (requiere ecotrack_ca.h y enroll_ca.h locales).
#define ECOTRACK_FIRMWARE_PRODUCTION 1

#if ECOTRACK_FIRMWARE_PRODUCTION
#include "ecotrack_ca.production.h"
#include "enroll_ca.production.h"
#else
#include "ecotrack_ca.h"
#include "enroll_ca.h"
#endif
