import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true
});

export const activityLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Batasi hingga 20 submission per menit dari satu IP
  message: 'Too many activity submissions from this IP, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false
});
