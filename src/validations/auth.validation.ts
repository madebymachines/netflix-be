import Joi from 'joi';
import { password } from './custom.validation';

const register = {
  body: Joi.object().keys({
    username: Joi.string().required(),
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required().custom(password),
    country: Joi.string().required().valid('SG', 'TH', 'MY')
  })
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required()
  })
};

const logout = {
  cookies: Joi.object()
    .keys({
      refreshToken: Joi.string()
    })
    .unknown(true)
};

const refreshTokens = {
  cookies: Joi.object()
    .keys({
      refreshToken: Joi.string().required()
    })
    .unknown(true)
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required().lowercase()
  })
};

const resetPassword = {
  body: Joi.object().keys({
    email: Joi.string().email().required().lowercase(),
    otp: Joi.string().length(6).required(),
    password: Joi.string().required().custom(password)
  })
};

const verifyEmail = {
  body: Joi.object().keys({
    email: Joi.string().email().required().lowercase(),
    otp: Joi.string().required().length(6)
  })
};

const resendVerificationEmail = {
  body: Joi.object().keys({
    email: Joi.string().email().required().lowercase()
  })
};

export default {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail
};
