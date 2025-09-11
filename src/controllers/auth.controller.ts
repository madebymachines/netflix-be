import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { authService, userService, tokenService, emailService, activityService } from '../services';
import exclude from '../utils/exclude';
import { User, PurchaseStatus } from '@prisma/client';
import config from '../config/config';
import { AuthTokensResponse } from '../types/response';
import { Response } from 'express';
import prisma from '../client';

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

const clearAuthCookies = (res: Response) => {
  const isProduction = config.env === 'production';
  // Opsi harus persis sama dengan saat cookie di-set, kecuali 'expires'.
  // Menambahkan path: '/' adalah praktik terbaik untuk memastikan cookie dihapus dari seluruh domain.
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const)
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
};

const register = catchAsync(async (req, res) => {
  // `gender` sekarang diambil dari body dan diteruskan
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

  const latestVerification = await prisma.purchaseVerification.findFirst({
    where: { userId: user.id },
    orderBy: { submittedAt: 'desc' }
  });
  const purchaseStatus = latestVerification?.status || PurchaseStatus.NOT_VERIFIED;
  user.purchaseStatus = purchaseStatus;

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
  const user = await userService.getUserByEmail(req.body.email, ['name']);
  // Untuk alasan keamanan, kita tidak memberi tahu jika email tidak ada.
  // Namun, jika ada, kita kirim email.
  if (user) {
    const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
    await emailService.sendResetPasswordEmail(req.body.email, user.name, resetPasswordToken);
  }
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
