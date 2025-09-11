import prisma from '../client';
import { Strategy as JwtStrategy, VerifyCallback } from 'passport-jwt';
import { Request } from 'express';
import config from './config';
import { TokenType } from '@prisma/client';

const cookieExtractor = (req: Request): string | null => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['accessToken'];
  }
  return token;
};

const jwtOptions = {
  secretOrKey: config.jwt.secret,
  jwtFromRequest: cookieExtractor
};

const jwtVerify: VerifyCallback = async (payload, done) => {
  try {
    if (payload.type !== TokenType.ACCESS) {
      throw new Error('Invalid token type');
    }

    let entity: any = null;
    if (payload.entityType === 'admin') {
      entity = await prisma.admin.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, role: true }
      });
      if (entity) entity.entityType = 'admin';
    } else {
      entity = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          gender: true,
          createdAt: true
        }
      });
      if (entity) entity.entityType = 'user';
    }

    if (!entity) {
      return done(null, false);
    }

    done(null, entity);
  } catch (error) {
    done(error, false);
  }
};

export const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);
