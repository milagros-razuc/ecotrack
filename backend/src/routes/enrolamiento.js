const express = require('express');
const { enrolamientoSchema } = require('../schemas');
const { enrollmentLimiter } = require('../middleware/rateLimiter');
const {
  ERROR_ENROLAMIENTO,
  createEnrollmentService,
} = require('../services/enrolamiento.service');

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function createEnrollmentRouter({ service = createEnrollmentService() } = {}) {
  const router = express.Router();
  router.post('/', enrollmentLimiter, async (req, res) => {
    if (!isHttps(req)) return res.status(409).json({ error: ERROR_ENROLAMIENTO });
    const parsed = enrolamientoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(409).json({ error: ERROR_ENROLAMIENTO });
    try {
      const result = await service.enrolar({
        deviceId: parsed.data.device_id,
        deviceSecret: parsed.data.device_secret,
      });
      return res.status(200).json(result);
    } catch {
      return res.status(409).json({ error: ERROR_ENROLAMIENTO });
    }
  });
  return router;
}

module.exports = createEnrollmentRouter;
