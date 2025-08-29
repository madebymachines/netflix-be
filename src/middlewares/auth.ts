import passport from 'passport';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError';
import { roleRights } from '../config/roles';
import { NextFunction, Request, Response } from 'express';
import { Admin, User } from '@prisma/client';

const verifyCallback =
  (
    req: any,
    resolve: (value?: unknown) => void,
    reject: (reason?: unknown) => void,
    requiredRights: string[]
  ) =>
  async (
    err: unknown,
    entity: (User | Admin) & { entityType: string; role?: any },
    info: unknown
  ) => {
    if (err || info || !entity) {
      return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }
    req.user = entity;

    if (requiredRights.length) {
      // Hanya admin yang punya 'rights'
      if (entity.entityType !== 'admin') {
        return reject(new ApiError(httpStatus.FORBIDDEN, 'Forbidden'));
      }

      const userRights = roleRights.get(entity.role) ?? [];
      const hasRequiredRights = requiredRights.every((requiredRight) =>
        userRights.includes(requiredRight)
      );
      if (!hasRequiredRights) {
        return reject(new ApiError(httpStatus.FORBIDDEN, 'Forbidden'));
      }
    }

    resolve();
  };

const auth =
  (...requiredRights: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    return new Promise((resolve, reject) => {
      passport.authenticate(
        'jwt',
        { session: false },
        verifyCallback(req, resolve, reject, requiredRights)
      )(req, res, next);
    })
      .then(() => next())
      .catch((err) => next(err));
  };

export default auth;
