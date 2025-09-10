import { PurchaseStatus } from '@prisma/client';
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

const getActivitySubmissions = {
  query: Joi.object().keys({
    status: Joi.string().valid(...Object.values(PurchaseStatus)),
    nameOrEmail: Joi.string(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string().valid('createdAt', 'reviewedAt'),
    sortType: Joi.string().valid('asc', 'desc')
  })
};

const approveActivitySubmission = {
  params: Joi.object().keys({
    activityId: Joi.number().integer().required()
  })
};

const rejectActivitySubmission = {
  params: Joi.object().keys({
    activityId: Joi.number().integer().required()
  }),
  body: Joi.object().keys({
    rejectionReason: Joi.string().optional().allow('')
  })
};

const getWeeklyWorkoutStats = {
  // Tidak ada validasi body, query, atau params yang dibutuhkan
};

export default {
  saveActivity,
  getActivityHistory,
  getActivitySubmissions,
  approveActivitySubmission,
  rejectActivitySubmission,
  getWeeklyWorkoutStats
};
