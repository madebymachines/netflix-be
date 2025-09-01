import { PurchaseStatus } from '@prisma/client';
import Joi from 'joi';
import { password } from './custom.validation';

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    username: Joi.string().required(),
    phoneNumber: Joi.string().optional(),
    country: Joi.string().optional()
  })
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
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
      name: Joi.string(),
      username: Joi.string(),
      phoneNumber: Joi.string().optional().allow(''),
      country: Joi.string().optional().allow('')
    })
    .min(1)
};

const updateMe = {
  body: Joi.object()
    .keys({
      name: Joi.string(),
      username: Joi.string(),
      phoneNumber: Joi.string().optional().allow('')
    })
    .min(1)
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer()
  })
};

const uploadPurchaseVerification = {
  body: Joi.object().keys({
    type: Joi.string().valid('MEMBER_GYM', 'RECEIPT').required()
  })
};

const updateProfilePicture = {
  body: Joi.object().keys({})
};

const approvePurchase = {
  params: Joi.object().keys({
    verificationId: Joi.number().integer().required()
  })
};

const rejectPurchase = {
  params: Joi.object().keys({
    verificationId: Joi.number().integer().required()
  }),
  body: Joi.object().keys({
    rejectionReason: Joi.string().optional().allow('')
  })
};

const getPurchaseVerifications = {
  query: Joi.object().keys({
    status: Joi.string().valid(...Object.values(PurchaseStatus)),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string().valid('submittedAt', 'reviewedAt'),
    sortType: Joi.string().valid('asc', 'desc')
  })
};

export default {
  createUser,
  getUsers,
  getUser,
  updateUser,
  updateMe,
  deleteUser,
  uploadPurchaseVerification,
  updateProfilePicture,
  approvePurchase,
  rejectPurchase,
  getPurchaseVerifications
};
