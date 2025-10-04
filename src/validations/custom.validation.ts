import Joi from 'joi';

export const password: Joi.CustomValidator<string> = (value, helpers) => {
  if (value.length < 8) {
    return helpers.error('any.custom', { message: 'Password must be at least 8 characters' });
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return helpers.error('any.custom', {
      message: 'Password must contain at least 1 letter and 1 number'
    });
  }
  return value;
};
