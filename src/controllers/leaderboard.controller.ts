import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { User } from '@prisma/client';
import { leaderboardService } from '../services'; // Impor layanan
import pick from '../utils/pick';

const getLeaderboard = catchAsync(async (req, res) => {
  const options = pick(req.query, ['timespan', 'region', 'page', 'limit']);
  const result = await leaderboardService.getPublicLeaderboard(options);
  res.status(httpStatus.OK).send(result);
});

const getMyRank = catchAsync(async (req, res) => {
  const user = req.user as User;
  const options = pick(req.query, ['timespan', 'region']);
  const result = await leaderboardService.getUserRank(user.id, options);
  res.status(httpStatus.OK).send(result);
});

export default {
  getLeaderboard,
  getMyRank
};
