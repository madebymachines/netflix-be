import { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import httpStatus from 'http-status';
import multer from 'multer';
import config from '../config/config';
import logger from '../config/logger';
import ApiError from '../utils/ApiError';

export const errorConverter: ErrorRequestHandler = (err, req, res, next) => {
  let error: any = err;

  // 1) Khusus Multer (upload)
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'File too large'));
    }
    return next(new ApiError(400, 'Invalid file upload'));
  }

  // 2) Mapping error Sharp untuk gambar terlalu besar
  if (
    typeof error?.message === 'string' &&
    error.message.includes('Input image exceeds pixel limit')
  ) {
    return next(new ApiError(400, 'Image dimensions are too large (max 4096x4096).'));
  }

  // 3) Konversi error umum -> ApiError
  if (!(error instanceof ApiError)) {
    // Perbaiki precedence ternary: pakai if-else biar tidak salah 400 terus
    let statusCode: number;
    if (error?.statusCode) {
      statusCode = error.statusCode;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      statusCode = httpStatus.BAD_REQUEST;
    } else {
      statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    }

    const message: string =
      (typeof error?.message === 'string' && error.message) || (httpStatus[statusCode] as string);
    error = new ApiError(statusCode, message, false, err.stack);
  }
  next(error);
};

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  let { statusCode, message } = err as any;

  if (config.env === 'production' && !(err as any).isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR] as string;
  }

  res.locals.errorMessage = (err as any).message;

  const response: any = {
    code: statusCode,
    message,
    ...(config.env === 'development' && { stack: (err as any).stack })
  };

  if (config.env === 'development') {
    logger.error(err);
  }

  res.status(statusCode).send(response);
};
