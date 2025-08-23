import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { authService, userService, tokenService, emailService } from '../services';
import exclude from '../utils/exclude';
import { User } from '@prisma/client';
import config from '../config/config';
import { AuthTokensResponse } from '../types/response';
import { Response } from 'express';

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

const clearAuthCookies = (res: Response) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

const register = catchAsync(async (req, res) => {
  const { name, username, email, password, phoneNumber } = req.body;
  const user = await userService.createUser(email, password, name, username, phoneNumber);
  const userWithoutPassword = exclude(user, ['password', 'createdAt', 'updatedAt']);
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
  await emailService.sendVerificationEmail(user.email, verifyEmailToken);
  res.status(httpStatus.CREATED).send({
    user: userWithoutPassword,
    message: 'Registration successful. Please check your email to verify your account.'
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  setAuthCookies(res, tokens);
  res.send({ user });
});

const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearAuthCookies(res);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  const tokens = await authService.refreshAuth(refreshToken);
  setAuthCookies(res, tokens);
  res.status(httpStatus.NO_CONTENT).send();
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token as string, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const user = req.user as User;
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
  await emailService.sendVerificationEmail(user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token as string);
  res.status(httpStatus.NO_CONTENT).send();
});

export default {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail
};
