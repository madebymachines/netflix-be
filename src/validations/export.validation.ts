import Joi from 'joi';

const requestExport = {
  body: Joi.object().keys({
    type: Joi.string().required().valid('PARTICIPANTS', 'LEADERBOARD'),
    filters: Joi.object().required()
  })
};

export default {
  requestExport
};
