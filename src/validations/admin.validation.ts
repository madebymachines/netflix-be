import Joi from 'joi';
import { password } from './custom.validation';
import { AdminRole } from '@prisma/client';

const adminLogin = {
  body: Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required()
  })
};

const createAdmin = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    role: Joi.string().required().valid(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  })
};

export default {
  adminLogin,
  createAdmin
};
