import { Role } from '@prisma/client';
import Joi from 'joi';
import { password } from './custom.validation';

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    fullName: Joi.string().required(),
    username: Joi.string().required(),
    phoneNumber: Joi.string().optional(),
    country: Joi.string().optional(),
    role: Joi.string().required().valid(Role.USER, Role.ADMIN)
  })
};

const getUsers = {
  query: Joi.object().keys({
    fullName: Joi.string(),
    role: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer()
  })
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer()
  })
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer()
  }),
  body: Joi.object()
    .keys({
      email: Joi.string().email(),
      password: Joi.string().custom(password),
      fullName: Joi.string(),
      username: Joi.string(),
      phoneNumber: Joi.string().optional().allow(''),
      country: Joi.string().optional().allow(''),
      profilePictureUrl: Joi.string().uri().optional().allow('')
    })
    .min(1)
};

const updateMe = {
  body: Joi.object()
    .keys({
      fullName: Joi.string(),
      phoneNumber: Joi.string().optional().allow('')
    })
    .min(1)
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer()
  })
};

export default {
  createUser,
  getUsers,
  getUser,
  updateUser,
  updateMe,
  deleteUser
};
