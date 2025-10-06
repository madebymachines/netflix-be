import jwt from 'jsonwebtoken';
import moment, { Moment } from 'moment';
import httpStatus from 'http-status';
import config from '../config/config';
import userService from './user.service';
import ApiError from '../utils/ApiError';
import { Token, TokenType, User, Admin } from '@prisma/client';
import prisma from '../client';
import { AuthTokensResponse } from '../types/response';

// FIX: Mengubah tipe Entity agar lebih fleksibel, hanya membutuhkan 'id'
type Entity = { id: number };
type EntityType = 'user' | 'admin';

/**
 * Blacklist a token (untuk logout)
 */
const blacklistToken = async (token: string): Promise<void> => {
  try {
    const payload = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
    
    // Validasi payload.sub ada dan valid
    if (!payload.sub || typeof payload.sub !== 'number' && typeof payload.sub !== 'string') {
      throw new Error('Invalid token payload');
    }
    
    const entityId = Number(payload.sub);
    const entityType = payload.entityType as EntityType;
    
    if (!entityType || (entityType !== 'user' && entityType !== 'admin')) {
      throw new Error('Invalid entity type in token');
    }
    
    const expires = moment.unix(payload.exp || 0);

    await prisma.token.create({
      data: {
        token,
        expires: expires.toDate(),
        type: TokenType.ACCESS,
        blacklisted: true,
        ...(entityType === 'admin' ? { adminId: entityId } : { userId: entityId })
      }
    });
  } catch (error) {
    // Token invalid atau expired, ignore
    console.error('Failed to blacklist token:', error);
  }
};

/**
 * Generate token
 */
const generateToken = (
  entityId: number,
  expires: Moment,
  type: TokenType,
  entityType: EntityType,
  secret = config.jwt.secret
): string => {
  const payload = {
    sub: entityId,
    iat: moment().unix(),
    exp: expires.unix(),
    type,
    entityType
  };
  return jwt.sign(payload, secret);
};

/**
 * Save a token
 */
const saveToken = async (
  token: string,
  entityId: number,
  expires: Moment,
  type: TokenType,
  entityType: EntityType,
  blacklisted = false
): Promise<Token> => {
  const data = {
    token,
    expires: expires.toDate(),
    type,
    blacklisted,
    ...(entityType === 'admin' ? { adminId: entityId } : { userId: entityId })
  };
  const createdToken = prisma.token.create({ data });
  return createdToken;
};

/**
 * Verify token and return token doc
 */
const verifyToken = async (token: string, type: TokenType): Promise<Token> => {
  const payload = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
  const entityId = Number(payload.sub);
  const entityType = payload.entityType;

  const whereClause = {
    token,
    type,
    blacklisted: false,
    ...(entityType === 'admin' ? { adminId: entityId } : { userId: entityId })
  };

  const tokenData = await prisma.token.findFirst({ where: whereClause });
  if (!tokenData) {
    throw new Error('Token not found');
  }
  return tokenData;
};

/**
 * Generate auth tokens
 */
const generateAuthTokens = async (
  entity: Entity,
  entityType: EntityType
): Promise<AuthTokensResponse> => {
  const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, 'minutes');
  const accessToken = generateToken(entity.id, accessTokenExpires, TokenType.ACCESS, entityType);

  const refreshTokenExpires = moment().add(config.jwt.refreshExpirationDays, 'days');
  const refreshToken = generateToken(entity.id, refreshTokenExpires, TokenType.REFRESH, entityType);
  await saveToken(refreshToken, entity.id, refreshTokenExpires, TokenType.REFRESH, entityType);

  return {
    access: {
      token: accessToken,
      expires: accessTokenExpires.toDate()
    },
    refresh: {
      token: refreshToken,
      expires: refreshTokenExpires.toDate()
    }
  };
};

/**
 * Generate reset password token
 */
const generateResetPasswordOtp = async (email: string): Promise<string> => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    // sengaja lempar error supaya caller bisa “silent” kalau mau
    throw new ApiError(httpStatus.NOT_FOUND, 'No users found with this email');
  }

  // opsional: bersihkan OTP reset yang masih aktif agar hanya 1 yang berlaku
  await prisma.token.deleteMany({
    where: { userId: user.id, type: TokenType.RESET_PASSWORD, expires: { gt: new Date() } }
  });

  const expires = moment().add(config.jwt.resetPasswordExpirationMinutes, 'minutes');
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await saveToken(otp, user.id as number, expires, TokenType.RESET_PASSWORD, 'user');
  return otp;
};

/**
 * Generate verify email token
 */
const generateVerifyEmailToken = async (user: { id: number }): Promise<string> => {
  const expires = moment().add(config.jwt.verifyEmailExpirationMinutes, 'minutes');
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await saveToken(otp, user.id, expires, TokenType.VERIFY_EMAIL, 'user');
  return otp;
};

export default {
  blacklistToken,
  generateToken,
  saveToken,
  verifyToken,
  generateAuthTokens,
  generateResetPasswordOtp,
  generateVerifyEmailToken
};
