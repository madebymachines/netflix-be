import Joi from 'joi';

const saveActivity = {
  body: Joi.object().keys({
    eventType: Joi.string().valid('INDIVIDUAL', 'GROUP').required(),
    pointsEarn: Joi.number().integer().min(0).required()
  })
};

const getActivityHistory = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100)
  })
};

export default {
  saveActivity,
  getActivityHistory
};
