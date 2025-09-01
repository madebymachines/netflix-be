import Joi from 'joi';

const getLeaderboard = {
  query: Joi.object().keys({
    timespan: Joi.string().valid('alltime', 'streak', 'weekly').default('alltime'),
    region: Joi.string(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100)
  })
};

const getMyRank = {
  query: Joi.object().keys({
    timespan: Joi.string().valid('alltime', 'streak', 'weekly').default('alltime'),
    region: Joi.string()
  })
};

export default {
  getLeaderboard,
  getMyRank
};
