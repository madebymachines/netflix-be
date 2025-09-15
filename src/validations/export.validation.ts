import Joi from 'joi';

const requestExport = {
  body: Joi.object().keys({
    type: Joi.string()
      .required()
      .valid('PARTICIPANTS', 'LEADERBOARD', 'VERIFICATIONS', 'SUBMISSIONS'),
    filters: Joi.object()
      .keys({
        // General
        email: Joi.string().email().optional().allow(''),
        country: Joi.string().optional(),
        dateRange: Joi.object({
          from: Joi.date().required(),
          to: Joi.date().required()
        }).optional(),

        // Participants
        isBanned: Joi.string().valid('true', 'false').optional(),
        purchaseStatus: Joi.string()
          .valid('NOT_VERIFIED', 'PENDING', 'APPROVED', 'REJECTED')
          .optional(),

        // Leaderboard
        timespan: Joi.string().valid('alltime', 'weekly', 'monthly', 'streak').optional(),
        limit: Joi.number().integer().min(1).optional(),

        // Verifications
        verificationType: Joi.string().valid('MEMBER_GYM', 'RECEIPT').optional(),

        // Submissions
        eventType: Joi.string().valid('INDIVIDUAL', 'GROUP').optional(),

        // General Status for Verifications/Submissions
        status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED').optional()
      })
      .required()
  })
};

export default {
  requestExport
};
