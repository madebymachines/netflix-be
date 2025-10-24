import Joi from 'joi';
import { password } from './custom.validation';
import { AdminRole } from '@prisma/client';

const adminLogin = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required()
  })
};

const createAdmin = {
  body: Joi.object().keys({
    email: Joi.string().required().email().lowercase(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    role: Joi.string().required().valid(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  })
};

const updateRegistrationSettings = {
  body: Joi.object().keys({
    isRegistrationOpen: Joi.boolean().required(),
    registrationLimit: Joi.number().integer().min(0).required()
  })
};

export default {
  adminLogin,
  createAdmin,
  updateRegistrationSettings
};
