import Joi from 'joi';

const generateTestVoucher = {
  query: Joi.object().keys({
    username: Joi.string()
      .required()
      .min(1)
      .max(50)
      .description('Username to be printed on the voucher')
  })
};

export default {
  generateTestVoucher
};
