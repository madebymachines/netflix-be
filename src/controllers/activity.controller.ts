import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import pick from '../utils/pick';
import { User } from '@prisma/client';
import { activityService } from '../services'; // Impor layanan

const saveActivity = catchAsync(async (req, res) => {
  const user = req.user as User;
  const result = await activityService.saveActivity(user.id, req.body);
  res.status(httpStatus.OK).send(result);
});

const getActivityHistory = catchAsync(async (req, res) => {
  const user = req.user as User;
  const options = pick(req.query, ['limit', 'page']);
  const result = await activityService.getActivityHistory(user.id, options);
  res.status(httpStatus.OK).send(result);
});

export default {
  saveActivity,
  getActivityHistory
};
