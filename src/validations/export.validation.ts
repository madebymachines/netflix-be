import Joi from 'joi';

const requestExport = {
  body: Joi.object().keys({
    type: Joi.string()
      .required()
      .valid('PARTICIPANTS', 'LEADERBOARD', 'VERIFICATIONS', 'SUBMISSIONS'),
    filters: Joi.object()
      .keys({
        // For Participants
        isBanned: Joi.string().valid('true', 'false').optional(),

        // For Leaderboard
        timespan: Joi.string().valid('alltime', 'weekly', 'streak').optional(),

        // For Verifications & Submissions
        dateRange: Joi.object({
          from: Joi.date().required(),
          to: Joi.date().required()
        }).optional(),
        status: Joi.string().optional(),

        // Optional for all
        email: Joi.string().email().optional().allow('')
      })
      .required()
  })
};

export default {
  requestExport
};
