import httpStatus from 'http-status';
import tokenService from './token.service';
import userService from './user.service';
import ApiError from '../utils/ApiError';
import { Admin, TokenType, User } from '@prisma/client';
import prisma from '../client';
import { encryptPassword, isPasswordMatch } from '../utils/encryption';
import { AuthTokensResponse } from '../types/response';
import emailService from './email.service';
import { getAdminByEmail, getAdminById } from './admin.service';

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email: string, password: string): Promise<User> => {
  const user = await userService.getUserByEmail(email, [
    'id',
    'email',
    'name',
    'username',
    'phoneNumber',
    'country',
    'profilePictureUrl',
    'purchaseStatus',
    'password',
    'emailVerifiedAt',
    'isBanned',
    'bannedAt', // Ditambahkan
    'banReason', // Ditambahkan
    'createdAt',
    'updatedAt'
  ]);
  if (!user || !(await isPasswordMatch(password, user.password as string))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  if (user.isBanned) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Your account has been banned.');
  }
  if (!user.emailVerifiedAt) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email not verified');
  }
  return user;
};

/**
 * Login admin with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Admin>}
 */
const loginAdminWithEmailAndPassword = async (email: string, password: string): Promise<Admin> => {
  const admin = await getAdminByEmail(email);
  if (!admin || !(await isPasswordMatch(password, admin.password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  return admin;
};

const logout = async (refreshToken: string): Promise<void> => {
  const refreshTokenData = await prisma.token.findFirst({
    where: {
      token: refreshToken,
      type: TokenType.REFRESH,
      blacklisted: false
    }
  });
  if (!refreshTokenData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await prisma.token.delete({ where: { id: refreshTokenData.id } });
};

const refreshAuth = async (refreshToken: string): Promise<AuthTokensResponse> => {
  try {
    const refreshTokenData = await tokenService.verifyToken(refreshToken, TokenType.REFRESH);
    await prisma.token.delete({ where: { id: refreshTokenData.id } });

    if (refreshTokenData.userId) {
      const user = await userService.getUserById(refreshTokenData.userId);
      if (!user) throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
      if (user.isBanned) throw new ApiError(httpStatus.UNAUTHORIZED, 'User is banned');
      return tokenService.generateAuthTokens(user, 'user');
    }

    if (refreshTokenData.adminId) {
      const admin = await getAdminById(refreshTokenData.adminId);
      if (!admin) throw new ApiError(httpStatus.UNAUTHORIZED, 'Admin not found');
      return tokenService.generateAuthTokens(admin, 'admin');
    }

    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token');
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

const resetPassword = async (resetPasswordToken: string, newPassword: string): Promise<void> => {
  try {
    const resetPasswordTokenData = await tokenService.verifyToken(
      resetPasswordToken,
      TokenType.RESET_PASSWORD
    );
    const userId = resetPasswordTokenData.userId;
    if (!userId) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token');
    }
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new Error();
    }
    const hashedPassword = await encryptPassword(newPassword);
    await userService.updateUserById(user.id, { password: hashedPassword });
    await prisma.token.deleteMany({ where: { userId: user.id, type: TokenType.RESET_PASSWORD } });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

const verifyEmail = async (email: string, otp: string): Promise<User> => {
  try {
    const user = await userService.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.emailVerifiedAt) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email has already been verified');
    }
    const verifyEmailTokenData = await prisma.token.findFirst({
      where: {
        userId: user.id,
        type: TokenType.VERIFY_EMAIL,
        token: otp,
        expires: { gt: new Date() }
      }
    });

    if (!verifyEmailTokenData) {
      throw new Error('Invalid or expired OTP');
    }

    const updatedUser = await userService.updateUserById(user.id, {
      emailVerifiedAt: new Date()
    });
    await prisma.token.deleteMany({
      where: { userId: user.id, type: TokenType.VERIFY_EMAIL }
    });
    if (!updatedUser) {
      throw new Error('Failed to update user verification status');
    }
    return updatedUser as User;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email verification failed';
    throw new ApiError(httpStatus.UNAUTHORIZED, message);
  }
};

const resendVerificationEmail = async (email: string): Promise<void> => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No user found with this email');
  }
  if (user.emailVerifiedAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is already verified');
  }
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(user);
  await emailService.sendVerificationEmail(user.email, verifyEmailToken);
};

export default {
  loginUserWithEmailAndPassword,
  loginAdminWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  resendVerificationEmail
};
