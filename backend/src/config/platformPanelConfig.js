const LAST_READING_WINDOW_DEFAULT_DAYS = 30;
const LAST_READING_WINDOW_MAX_DAYS = 365;
const RATE_LIMIT_WINDOW_DEFAULT_MS = 15 * 60 * 1000;

function parsePositiveInteger(name, rawValue, defaultValue, maximum = Number.MAX_SAFE_INTEGER) {
  if (rawValue === undefined || rawValue === '') return defaultValue;
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} debe ser un entero positivo no mayor que ${maximum}`);
  }
  return value;
}

function parseWindowMilliseconds(name, rawValue, defaultValue) {
  return parsePositiveInteger(name, rawValue, defaultValue);
}

const lastReadingWindowDays = parsePositiveInteger(
  'PLATFORM_LAST_READING_WINDOW_DAYS',
  process.env.PLATFORM_LAST_READING_WINDOW_DAYS,
  LAST_READING_WINDOW_DEFAULT_DAYS,
  LAST_READING_WINDOW_MAX_DAYS,
);

const rateLimits = {
  reset: {
    max: parsePositiveInteger('PLATFORM_RESET_RATE_LIMIT_MAX', process.env.PLATFORM_RESET_RATE_LIMIT_MAX, 10),
    windowMs: parseWindowMilliseconds(
      'PLATFORM_RESET_RATE_LIMIT_WINDOW_MS',
      process.env.PLATFORM_RESET_RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_WINDOW_DEFAULT_MS,
    ),
    counterKey: 'platform-reset',
  },
  read: {
    max: parsePositiveInteger('PLATFORM_READ_RATE_LIMIT_MAX', process.env.PLATFORM_READ_RATE_LIMIT_MAX, 300),
    windowMs: parseWindowMilliseconds(
      'PLATFORM_READ_RATE_LIMIT_WINDOW_MS',
      process.env.PLATFORM_READ_RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_WINDOW_DEFAULT_MS,
    ),
    counterKey: 'platform-read',
  },
  provision: {
    max: parsePositiveInteger(
      'PLATFORM_PROVISION_RATE_LIMIT_MAX',
      process.env.PLATFORM_PROVISION_RATE_LIMIT_MAX,
      5,
    ),
    windowMs: parseWindowMilliseconds(
      'PLATFORM_PROVISION_RATE_LIMIT_WINDOW_MS',
      process.env.PLATFORM_PROVISION_RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_WINDOW_DEFAULT_MS,
    ),
    counterKey: 'platform-provision',
  },
  clientAdmin: {
    max: parsePositiveInteger(
      'PLATFORM_CLIENT_ADMIN_RATE_LIMIT_MAX',
      process.env.PLATFORM_CLIENT_ADMIN_RATE_LIMIT_MAX,
      5,
    ),
    windowMs: parseWindowMilliseconds(
      'PLATFORM_CLIENT_ADMIN_RATE_LIMIT_WINDOW_MS',
      process.env.PLATFORM_CLIENT_ADMIN_RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_WINDOW_DEFAULT_MS,
    ),
    counterKey: 'platform-client-admin',
  },
};

module.exports = {
  LAST_READING_WINDOW_DEFAULT_DAYS,
  LAST_READING_WINDOW_MAX_DAYS,
  lastReadingWindowDays,
  rateLimits,
};
