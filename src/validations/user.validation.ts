import { Role } from '@prisma/client';
import Joi from 'joi';
import { password } from './custom.validation';

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(), // Diubah dari fullName
    username: Joi.string().required(),
    phoneNumber: Joi.string().optional(),
    country: Joi.string().optional(),
    role: Joi.string().required().valid(Role.USER, Role.ADMIN)
  })
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(), // Diubah dari fullName
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
      name: Joi.string(), // Diubah dari fullName
      username: Joi.string(),
      phoneNumber: Joi.string().optional().allow(''),
      country: Joi.string().optional().allow('')
      // profilePictureUrl dihapus karena ditangani melalui unggahan file
    })
    .min(1)
};

const updateMe = {
  body: Joi.object().keys({
    name: Joi.string(), // Diubah dari fullName
    phoneNumber: Joi.string().optional().allow('')
  })
  // Memperbolehkan body kosong jika ada file yang diunggah
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer()
  })
};

// Validasi baru untuk unggahan verifikasi pembelian
const uploadPurchaseVerification = {
  body: Joi.object().keys({}) // Body bisa kosong, validasi ada di file itu sendiri oleh middleware
};

export default {
  createUser,
  getUsers,
  getUser,
  updateUser,
  updateMe,
  deleteUser,
  uploadPurchaseVerification // Ekspor validasi baru
};
