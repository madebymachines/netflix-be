import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { authService, userService, tokenService, activityService } from '../services';
import { Response } from 'express';
import { AuthTokensResponse } from '../types/response';
import config from '../config/config';
import pick from '../utils/pick';
import { Admin, PurchaseStatus } from '@prisma/client';
import exclude from '../utils/exclude';
import ApiError from '../utils/ApiError';

const setAuthCookies = (res: Response, tokens: AuthTokensResponse) => {
  const isProduction = config.env === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const)
  };

  res.cookie('accessToken', tokens.access.token, {
    ...cookieOptions,
    expires: tokens.access.expires
  });

  if (tokens.refresh) {
    res.cookie('refreshToken', tokens.refresh.token, {
      ...cookieOptions,
      expires: tokens.refresh.expires
    });
  }
};

const adminLogin = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const admin = await authService.loginAdminWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(admin, 'admin');
  setAuthCookies(res, tokens);
  res.send({ message: 'Admin login successful', admin: exclude(admin, ['password']) });
});

const getMe = catchAsync(async (req, res) => {
  const admin = req.user as Admin;
  res.status(httpStatus.OK).send({ admin });
});

const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  const isProduction = config.env === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const)
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);

  res.status(httpStatus.OK).send({ message: 'Logged out successfully' });
});

const refreshTokens = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
  const tokens = await authService.refreshAuth(refreshToken);
  setAuthCookies(res, tokens);
  res.status(httpStatus.OK).send({ message: 'Tokens refreshed' });
});

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send({ message: 'User created successfully', user });
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'isBanned']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send({ message: 'Users retrieved successfully', ...result });
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(parseInt(req.params.userId));
  res.send({ message: 'User retrieved successfully', data: user });
});

const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(parseInt(req.params.userId), req.body);
  res.send({ message: 'User updated successfully', data: user });
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(parseInt(req.params.userId));
  res.status(httpStatus.OK).send({ message: 'User deleted successfully' });
});

const approvePurchase = catchAsync(async (req, res) => {
  const { verificationId } = req.params;
  await userService.reviewPurchaseVerification(parseInt(verificationId), PurchaseStatus.APPROVED);
  res.status(httpStatus.OK).send({ message: 'Purchase verification has been approved.' });
});

const rejectPurchase = catchAsync(async (req, res) => {
  const { verificationId } = req.params;
  const { rejectionReason } = req.body;
  await userService.reviewPurchaseVerification(
    parseInt(verificationId),
    PurchaseStatus.REJECTED,
    rejectionReason
  );
  res.status(httpStatus.OK).send({ message: 'Purchase verification has been rejected.' });
});

const getPurchaseVerifications = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'type', 'nameOrEmail']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'sortType']);
  const result = await userService.queryPurchaseVerifications(filter, options);
  res
    .status(httpStatus.OK)
    .send({ message: 'Purchase verifications retrieved successfully', ...result });
});

const getDashboardStats = catchAsync(async (req, res) => {
  const stats = await userService.getDashboardStats();
  res.status(httpStatus.OK).send({ message: 'Stats retrieved successfully', data: stats });
});

const getUserGrowthChartData = catchAsync(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string) : 30;
  const data = await userService.getUserGrowthStats(days);
  res.status(httpStatus.OK).send({ message: 'User growth data retrieved', data });
});

const getUserDetails = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const userDetails = await userService.getUserDetailsById(parseInt(userId));
  res.status(httpStatus.OK).send({ message: 'User details retrieved', data: userDetails });
});

const banUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  if (!reason) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Ban reason is required');
  }
  await userService.banUserById(parseInt(userId), reason);
  res.status(httpStatus.OK).send({ message: 'User has been banned successfully.' });
});

const unbanUser = catchAsync(async (req, res) => {
  const { userId } = req.params;
  await userService.unbanUserById(parseInt(userId));
  res.status(httpStatus.OK).send({ message: 'User has been unbanned successfully.' });
});

const getActivitySubmissions = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'nameOrEmail']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'sortType']);
  const result = await activityService.queryActivitySubmissions(filter, options);
  res
    .status(httpStatus.OK)
    .send({ message: 'Activity submissions retrieved successfully', ...result });
});

const approveActivitySubmission = catchAsync(async (req, res) => {
  const { activityId } = req.params;
  await activityService.reviewActivitySubmission(parseInt(activityId), 'APPROVED');
  res.status(httpStatus.OK).send({ message: 'Activity submission has been approved.' });
});

const rejectActivitySubmission = catchAsync(async (req, res) => {
  const { activityId } = req.params;
  const { rejectionReason } = req.body;
  await activityService.reviewActivitySubmission(parseInt(activityId), 'REJECTED', rejectionReason);
  res.status(httpStatus.OK).send({ message: 'Activity submission has been rejected.' });
});

export default {
  adminLogin,
  getMe,
  logout,
  refreshTokens,
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  approvePurchase,
  rejectPurchase,
  getPurchaseVerifications,
  getDashboardStats,
  getUserGrowthChartData,
  getUserDetails,
  banUser,
  unbanUser,
  getActivitySubmissions,
  approveActivitySubmission,
  rejectActivitySubmission
};
