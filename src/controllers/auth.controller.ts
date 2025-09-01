import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { authService, userService, tokenService, emailService, activityService } from '../services';
import exclude from '../utils/exclude';
import { User } from '@prisma/client';
import config from '../config/config';
import { AuthTokensResponse } from '../types/response';
import { Response } from 'express';
import prisma from '../client';

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
  const user = await userService.createUser(req.body);
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
  await emailService.sendVerificationEmail(user.email, verifyEmailToken);
  res
    .status(httpStatus.CREATED)
    .send({ message: 'Registration successful. Please check your email for OTP.' });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user, 'user');
  setAuthCookies(res, tokens);
  const userResponse = exclude(user, ['password']);

  const [userStats, totalRepsResult] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId: user.id } }),
    activityService.getUserIndividualReps(user.id)
  ]);

  const statsResponse = {
    totalPoints: userStats?.totalPoints || 0,
    totalChallenges: userStats?.totalChallenges || 0,
    topStreak: userStats?.topStreak || 0,
    currentStreak: userStats?.currentStreak || 0,
    region: user.country || null,
    totalReps: totalRepsResult,
    totalCalori: (userStats?.totalPoints || 0) * 0.3
  };

  res.send({ message: 'Login successful', user: userResponse, stats: statsResponse });
});

const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearAuthCookies(res);
  res.status(httpStatus.OK).send({ message: 'Logged out successfully' });
});

const refreshTokens = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  const tokens = await authService.refreshAuth(refreshToken);
  setAuthCookies(res, tokens);
  res.status(httpStatus.OK).send({ message: 'Tokens refreshed' });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.OK).send({
    message: 'If an account with that email exists, a password reset link has been sent.'
  });
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token as string, req.body.password);
  res.status(httpStatus.OK).send({ message: 'Password has been reset successfully' });
});

const sendMyVerificationEmail = catchAsync(async (req, res) => {
  const user = req.user as User;
  if (user.emailVerifiedAt) {
    res.status(httpStatus.BAD_REQUEST).send({ message: 'Email is already verified' });
    return;
  }
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
  await emailService.sendVerificationEmail(user.email, verifyEmailToken);
  res.status(httpStatus.OK).send({ message: 'Verification email sent' });
});

const resendVerificationEmail = catchAsync(async (req, res) => {
  await authService.resendVerificationEmail(req.body.email);
  res.status(httpStatus.OK).send({ message: 'A new verification OTP has been sent to your email' });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const user = await authService.verifyEmail(email, otp);
  const tokens = await tokenService.generateAuthTokens(user, 'user');
  setAuthCookies(res, tokens);
  const userResponse = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email
  };
  res.send({
    message: 'Email verified successfully.',
    token: tokens.access.token,
    user: userResponse
  });
});

export default {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendMyVerificationEmail,
  resendVerificationEmail,
  verifyEmail
};
