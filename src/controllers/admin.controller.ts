import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { authService, userService, tokenService } from '../services';
import { Response } from 'express';
import { AuthTokensResponse } from '../types/response';
import config from '../config/config';
import pick from '../utils/pick';
import { PurchaseStatus } from '@prisma/client';
import exclude from '../utils/exclude';

const setAuthCookies = (res: Response, tokens: AuthTokensResponse) => {
  res.cookie('accessToken', tokens.access.token, {
    httpOnly: true,
    expires: tokens.access.expires,
    secure: config.env === 'production'
  });
  if (tokens.refresh) {
    res.cookie('refreshToken', tokens.refresh.token, {
      httpOnly: true,
      expires: tokens.refresh.expires,
      secure: config.env === 'production'
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

const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send({ message: 'User created successfully', user });
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send({ message: 'Users retrieved successfully', data: result });
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
  const filter = pick(req.query, ['status', 'userId']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'sortType']);
  const result = await userService.queryPurchaseVerifications(filter, options);
  res
    .status(httpStatus.OK)
    .send({ message: 'Purchase verifications retrieved successfully', ...result });
});

export default {
  adminLogin,
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  approvePurchase,
  rejectPurchase,
  getPurchaseVerifications
};
