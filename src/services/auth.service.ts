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
import { 
  checkPasswordHistory, 
  savePasswordToHistory,
  invalidateAllUserTokens 
} from '../utils/passwordUtils';

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
    'username',
    'country',
    'profilePictureUrl',
    'purchaseStatus',
    'password',
    'emailVerifiedAt',
    'isBanned',
    'bannedAt',
    'banReason',
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

/**
 * Logout OLD CODE
 */
// const logout = async (refreshToken: string): Promise<void> => {
//   const refreshTokenData = await prisma.token.findFirst({
//     where: {
//       token: refreshToken,
//       type: TokenType.REFRESH,
//       blacklisted: false
//     }
//   });
//   if (!refreshTokenData) {
//     throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
//   }
//   await prisma.token.delete({ where: { id: refreshTokenData.id } });
// };


const logout = async (refreshToken: string, accessToken?: string): Promise<void> => {
  // Hapus refresh token
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

  if (accessToken) {
    await tokenService.blacklistToken(accessToken);
  }
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

const requestResetPasswordOtp = async (email: string): Promise<void> => {
  const user = await userService.getUserByEmail(email, ['id', 'email', 'username']);
  if (!user) return;

  const otp = await tokenService.generateResetPasswordOtp(email);
  await emailService.sendResetPasswordOtpEmail(user.email, user.username ?? user.email, otp);
};

const resetPasswordWithOtp = async (
  email: string,
  otp: string,
  newPassword: string
): Promise<void> => {
  // 1. Verify user exists
  const user = await userService.getUserByEmail(email, ['id', 'email', 'password']);
  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or OTP');
  }

  // 2. Verify OTP token
  const tokenRow = await prisma.token.findFirst({
    where: {
      userId: user.id,
      type: TokenType.RESET_PASSWORD,
      token: otp,
      blacklisted: false,
      expires: { gt: new Date() }
    }
  });

  if (!tokenRow) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
  }

  // 3. Check if new password is same as current password
  const isSameAsCurrent = await isPasswordMatch(newPassword, user.password as string);
  if (isSameAsCurrent) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'New password cannot be the same as your current password'
    );
  }

  // 4. Check password history (prevent reusing old passwords)
  const wasUsedBefore = await checkPasswordHistory(user.id, newPassword);
  if (wasUsedBefore) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This password was used recently. Please choose a different password'
    );
  }

  // 5. Hash the new password
  const hashedPassword = await encryptPassword(newPassword);

  // 6. Save current password to history before updating
  await savePasswordToHistory(user.id, user.password as string);

  // 7. Update user password
  await userService.updateUserById(user.id, { password: hashedPassword });

  // 8. Delete all reset password tokens (OTP sekali pakai)
  await prisma.token.deleteMany({
    where: { userId: user.id, type: TokenType.RESET_PASSWORD }
  });

  // 9. Invalidate all existing sessions for security
  await invalidateAllUserTokens(user.id);

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
  requestResetPasswordOtp,
  resetPasswordWithOtp,
  verifyEmail,
  resendVerificationEmail
};
