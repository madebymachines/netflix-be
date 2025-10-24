import { User, Prisma, PurchaseStatus, PurchaseType } from '@prisma/client';
import httpStatus from 'http-status';
import prisma from '../client';
import ApiError from '../utils/ApiError';
import { encryptPassword } from '../utils/encryption';
import emailService from './email.service';
import { savePasswordToHistory } from '../utils/passwordUtils';
import moment from 'moment';
import { generateVoucher } from './voucher.service';
import s3Service from './s3.service';
import config from '../config/config';
import logger from '../config/logger';
import settingService from './setting.service';

/**
 * Get user by username
 * @param {string} username
 * @param {Array<Key>} keys
 * @returns {Promise<Pick<User, Key> | null>}
 */
const getUserByUsername = async <Key extends keyof User>(
  username: string,
  keys: Key[] = [
    'id',
    'email',
    'username',
    'isBanned',
    'purchaseStatus',
    'createdAt',
    'updatedAt'
  ] as Key[]
): Promise<Pick<User, Key> | null> => {
  return prisma.user.findUnique({
    where: { username },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {})
  }) as Promise<Pick<User, Key> | null>;
};

const createUser = async (userBody: {
  email: string;
  password: string;
  username: string;
  country: string;
}): Promise<User> => {
  const settings = await settingService.getRegistrationSettings();

  if (!settings.isRegistrationOpen) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Registration is currently closed.');
  }

  if (settings.registrationLimit > 0) {
    const userCount = await prisma.user.count();
    if (userCount >= settings.registrationLimit) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Registration limit has been reached.');
    }
  }

  if (await getUserByEmail(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (await getUserByUsername(userBody.username)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Username already taken');
  }

  const hashedPassword = await encryptPassword(userBody.password);

  const user = await prisma.user.create({
    data: {
      ...userBody,
      password: hashedPassword
    }
  });

  // Initialize user stats
  await prisma.userStats.create({
    data: {
      userId: user.id
    }
  });

  // Save initial password to history
  await savePasswordToHistory(user.id, hashedPassword);

  return user;
};

/**
 * Query for users
 * @param {Object} filter - Prisma filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (
  filter: {
    name?: string;
    isBanned?: string;
    purchaseStatus?: PurchaseStatus;
  },
  options: {
    limit?: number;
    page?: number;
    sortBy?: string;
    sortType?: 'asc' | 'desc';
    fetchAll?: boolean;
  }
) => {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const sortBy = options.sortBy ?? 'createdAt';
  const sortType = options.sortType ?? 'desc';
  const fetchAll = options.fetchAll ?? false;

  const where: Prisma.UserWhereInput = {};
  if (filter.name) {
    where.username = { contains: filter.name, mode: 'insensitive' };
  }
  if (filter.isBanned && ['true', 'false'].includes(filter.isBanned)) {
    where.isBanned = filter.isBanned === 'true';
  }
  if (filter.purchaseStatus) {
    where.purchaseStatus = filter.purchaseStatus;
  }

  const findManyArgs: Prisma.UserFindManyArgs = {
    where,
    select: {
      id: true,
      email: true,
      username: true,
      country: true,
      isBanned: true,
      purchaseStatus: true,
      createdAt: true
    },
    orderBy: { [sortBy]: sortType }
  };

  if (!fetchAll) {
    findManyArgs.skip = (page - 1) * limit;
    findManyArgs.take = limit;
  }

  const [users, totalItems] = await prisma.$transaction([
    prisma.user.findMany(findManyArgs),
    prisma.user.count({ where })
  ]);

  const totalPages = fetchAll ? 1 : Math.ceil(totalItems / limit);

  return {
    data: users,
    pagination: {
      currentPage: page,
      limit: fetchAll ? totalItems : limit,
      totalItems,
      totalPages
    }
  };
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @param {Array<Key>} keys
 * @returns {Promise<Pick<User, Key> | null>}
 */
const getUserById = async <Key extends keyof User>(
  id: number,
  keys: Key[] = [
    'id',
    'email',
    'username',
    'profilePictureUrl',
    'country',
    'purchaseStatus',
    'isBanned',
    'bannedAt',
    'banReason'
  ] as Key[]
): Promise<Pick<User, Key> | null> => {
  return prisma.user.findUnique({
    where: { id },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {})
  }) as Promise<Pick<User, Key> | null>;
};

const getUserByEmail = async <Key extends keyof User>(
  email: string,
  keys: Key[] = [
    'id',
    'email',
    'username',
    'password',
    'emailVerifiedAt',
    'isBanned',
    'bannedAt',
    'banReason',
    'createdAt',
    'updatedAt'
  ] as Key[]
): Promise<Pick<User, Key> | null> => {
  return prisma.user.findUnique({
    where: { email },
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {})
  }) as Promise<Pick<User, Key> | null>;
};

const updateUserById = async <Key extends keyof User>(
  userId: number,
  updateBody: Prisma.UserUpdateInput,
  keys: Key[] = ['id', 'email', 'username'] as Key[]
): Promise<Pick<User, Key> | null> => {
  const user = await getUserById(userId, ['id', 'email', 'username']);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (
    updateBody.email &&
    user.email !== updateBody.email &&
    (await getUserByEmail(updateBody.email as string))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (
    updateBody.username &&
    user.username !== updateBody.username &&
    (await getUserByUsername(updateBody.username as string))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Username already taken');
  }
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateBody,
    select: keys.reduce((obj, k) => ({ ...obj, [k]: true }), {})
  });
  return updatedUser as Pick<User, Key> | null;
};

const deleteUserById = async (userId: number): Promise<User> => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await prisma.user.delete({ where: { id: user.id } });
  return user as User;
};

const reviewPurchaseVerification = async (
  verificationId: number,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
) => {
  const verification = await prisma.purchaseVerification.findUnique({
    where: { id: verificationId },
    include: {
      user: {
        select: {
          email: true,
          username: true
        }
      }
    }
  });

  if (!verification) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase verification not found');
  }

  if (!verification.user) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'User associated with verification not found.'
    );
  }

  if (verification.status !== PurchaseStatus.PENDING) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Purchase has already been ${verification.status.toLowerCase()}`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseVerification.update({
      where: { id: verificationId },
      data: {
        status,
        rejectionReason: status === PurchaseStatus.REJECTED ? rejectionReason : null,
        reviewedAt: new Date()
      }
    });

    await tx.user.update({
      where: { id: verification.userId },
      data: {
        purchaseStatus: status
      }
    });
  });

  if (status === PurchaseStatus.REJECTED) {
    await emailService.sendPurchaseRejectionEmail(
      verification.user.email,
      verification.user.username,
      rejectionReason
    );
  } else if (status === PurchaseStatus.APPROVED) {
    try {
      // 1. Generate gambar voucher
      const voucherBuffer = await generateVoucher(verification.user.username);

      // 2. Kirim email approval dengan buffer voucher untuk disematkan
      await emailService.sendPurchaseApprovalEmail(
        verification.user.email,
        verification.user.username,
        voucherBuffer
      );
    } catch (error) {
      logger.error(
        `Failed to generate or send voucher for user ${verification.user.email}:`,
        error
      );
      // Fallback: Kirim email approval standar tanpa voucher jika terjadi error
      await emailService.sendPurchaseApprovalEmail(
        verification.user.email,
        verification.user.username
      );
    }
  }
};

/**
 * Query for purchase verifications (for admin)
 * @param {Object} filter - Prisma filter
 * @param {Object} options - Query options
 * @returns {Promise<object>}
 */
const queryPurchaseVerifications = async (
  filter: {
    status?: PurchaseStatus;
    type?: PurchaseType;
    nameOrEmail?: string;
    dateRange?: { from: Date; to: Date };
  },
  options: {
    limit?: number;
    page?: number;
    sortBy?: string;
    sortType?: 'asc' | 'desc';
    fetchAll?: boolean;
  }
): Promise<object> => {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const sortBy = options.sortBy ?? 'submittedAt';
  const sortType = options.sortType ?? 'desc';
  const fetchAll = options.fetchAll ?? false;

  const where: Prisma.PurchaseVerificationWhereInput = {
    user: { isBanned: false }
  };
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.type) {
    where.type = filter.type;
  }
  if (filter.nameOrEmail) {
    where.user = {
      isBanned: false,
      OR: [
        { username: { contains: filter.nameOrEmail, mode: 'insensitive' } },
        { email: { contains: filter.nameOrEmail, mode: 'insensitive' } }
      ]
    };
  }
  if (filter.dateRange) {
    where.submittedAt = {
      gte: filter.dateRange.from,
      lte: filter.dateRange.to
    };
  }

  const findManyArgs: Prisma.PurchaseVerificationFindManyArgs = {
    where,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    },
    orderBy: { [sortBy]: sortType }
  };

  if (!fetchAll) {
    findManyArgs.skip = (page - 1) * limit;
    findManyArgs.take = limit;
  }

  const [verifications, totalItems] = await prisma.$transaction([
    prisma.purchaseVerification.findMany(findManyArgs),
    prisma.purchaseVerification.count({ where })
  ]);

  // --- PERBAIKAN DIMULAI DI SINI ---
  // Ubah semua URL gambar menjadi presigned URL yang valid
  const signedVerifications = await Promise.all(
    verifications.map(async (verification) => {
      let signedUrl: string | null = verification.receiptImageUrl;

      if (signedUrl && signedUrl.startsWith('s3://')) {
        try {
          const s3Prefix = `s3://${config.aws.s3.bucketName}/`;
          const key = signedUrl.substring(s3Prefix.length);
          if (key) {
            // Buat presigned URL yang valid untuk 15 menit
            signedUrl = await s3Service.getPresignedUrl(key, 900);
          }
        } catch (e) {
          logger.error(`Failed to create presigned URL for S3 key: ${signedUrl}`, e);
          signedUrl = null; // Gagal membuat URL, kirim null agar FE bisa handle
        }
      }

      return {
        ...verification,
        receiptImageUrl: signedUrl
      };
    })
  );
  // --- PERBAIKAN SELESAI ---

  const totalPages = fetchAll ? 1 : Math.ceil(totalItems / limit);

  return {
    data: signedVerifications, // Kirim data yang URL-nya sudah diubah
    pagination: {
      currentPage: page,
      limit: fetchAll ? totalItems : limit,
      totalItems,
      totalPages
    }
  };
};

const banUserById = async (userId: number, reason?: string): Promise<User> => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (user.isBanned) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User is already banned');
  }
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isBanned: true,
      bannedAt: new Date(),
      banReason: reason
    }
  });
  return updatedUser;
};

const unbanUserById = async (userId: number): Promise<User> => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (!user.isBanned) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User is not banned');
  }
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isBanned: false,
      bannedAt: null,
      banReason: null
    }
  });
  return updatedUser;
};

const getDashboardStats = async () => {
  const sevenDaysAgo = moment().subtract(7, 'days').toDate();
  const whereNotBanned = { where: { isBanned: false } };
  const whereVerificationNotBanned = { where: { user: { isBanned: false } } };
  const whereActivityNotBanned = { where: { user: { isBanned: false } } };

  const [
    totalUsers,
    newUsers,
    approvedVerifications,
    rejectedVerifications,
    pendingVerifications,
    blockedUsers,
    pendingSubmissions,
    approvedSubmissions,
    rejectedSubmissions,
    flaggedSubmissions
  ] = await Promise.all([
    prisma.user.count(whereNotBanned),
    prisma.user.count({ where: { isBanned: false, createdAt: { gte: sevenDaysAgo } } }),
    prisma.purchaseVerification.count({
      where: { status: 'APPROVED', ...whereVerificationNotBanned.where }
    }),
    prisma.purchaseVerification.count({
      where: { status: 'REJECTED', ...whereVerificationNotBanned.where }
    }),
    prisma.purchaseVerification.count({
      where: { status: 'PENDING', ...whereVerificationNotBanned.where }
    }),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.activityHistory.count({ where: { status: 'PENDING', ...whereActivityNotBanned.where } }),
    prisma.activityHistory.count({
      where: { status: 'APPROVED', ...whereActivityNotBanned.where }
    }),
    prisma.activityHistory.count({
      where: { status: 'REJECTED', ...whereActivityNotBanned.where }
    }),
    prisma.activityHistory.count({ where: { isFlagged: true, ...whereActivityNotBanned.where } })
  ]);

  return {
    totalUsers,
    newUsers,
    approvedVerifications,
    rejectedVerifications,
    pendingVerifications,
    blockedUsers,
    pendingSubmissions,
    approvedSubmissions,
    rejectedSubmissions,
    flaggedSubmissions
  };
};

const getUserGrowthStats = async (days = 30) => {
  const endDate = moment().endOf('day').toDate();
  const startDate = moment()
    .subtract(days - 1, 'days')
    .startOf('day')
    .toDate();

  const results = await prisma.user.groupBy({
    by: ['createdAt'],
    where: {
      isBanned: false,
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    _count: {
      id: true
    }
  });

  // Post-process to group by day
  const dailyCounts = new Map<string, number>();
  results.forEach((result) => {
    const day = moment(result.createdAt).format('YYYY-MM-DD');
    dailyCounts.set(day, (dailyCounts.get(day) || 0) + result._count.id);
  });

  // Fill in missing days with 0 counts
  const finalData = [];
  for (let i = 0; i < days; i++) {
    const date = moment(startDate).add(i, 'days');
    const dateString = date.format('YYYY-MM-DD');
    finalData.push({
      date: dateString,
      count: dailyCounts.get(dateString) || 0
    });
  }

  return finalData;
};

const getUserDetailsById = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      stats: true,
      // Hapus pengambilan activityHistory di sini
      purchaseVerifications: {
        orderBy: { submittedAt: 'desc' },
        take: 10
      }
    }
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const rejectedStats = await prisma.activityHistory.aggregate({
    where: {
      userId: userId,
      status: 'REJECTED'
    },
    _count: {
      id: true
    },
    _sum: {
      pointsEarn: true
    }
  });

  return {
    ...user,
    rejectedChallenges: rejectedStats._count.id,
    rejectedPoints: rejectedStats._sum.pointsEarn || 0
  };
};

const queryUserActivityHistory = async (
  userId: number,
  options: { limit?: number; page?: number }
) => {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;

  const [activities, totalItems] = await prisma.$transaction([
    prisma.activityHistory.findMany({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.activityHistory.count({ where: { userId } })
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: activities,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages
    }
  };
};

export default {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  updateUserById,
  deleteUserById,
  reviewPurchaseVerification,
  queryPurchaseVerifications,
  banUserById,
  unbanUserById,
  getDashboardStats,
  getUserGrowthStats,
  getUserDetailsById,
  queryUserActivityHistory
};
