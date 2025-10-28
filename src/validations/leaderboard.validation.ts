import Joi from 'joi';

const getLeaderboard = {
  query: Joi.object().keys({
    timespan: Joi.string().valid('alltime', 'streak', 'weekly', 'monthly').default('alltime'),
    region: Joi.string(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })
};

const getMyRank = {
  query: Joi.object().keys({
    timespan: Joi.string().valid('alltime', 'streak', 'weekly', 'monthly').default('alltime'),
    region: Joi.string()
  })
};

export default {
  getLeaderboard,
  getMyRank
};
