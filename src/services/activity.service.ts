import { Prisma, PurchaseStatus } from '@prisma/client';
import prisma from '../client';
import moment from 'moment';
import s3Service from './s3.service';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';

/**
 * Menyimpan aktivitas baru dan memperbarui statistik pengguna.
 * @param userId - ID pengguna.
 * @param activityBody - Detail aktivitas.
 * @param {Express.Multer.File} file - File gambar yang diunggah.
 * @returns {Promise<object>}
 */
const saveActivity = async (
  userId: number,
  activityBody: {
    eventType: 'INDIVIDUAL' | 'GROUP';
    pointsEarn: number;
  },
  file: Express.Multer.File
) => {
  const { eventType, pointsEarn } = activityBody;

  const imageUrl = await s3Service.uploadFile(
    file.buffer,
    file.originalname,
    file.mimetype,
    'submission'
  );

  return prisma.$transaction(async (tx) => {
    // 1. Dapatkan atau buat UserStats
    let userStats = await tx.userStats.findUnique({
      where: { userId }
    });

    if (!userStats) {
      userStats = await tx.userStats.create({
        data: { userId }
      });
    }

    const today = moment().startOf('day');
    const lastUpdatedDay = moment(userStats.lastUpdated).startOf('day');

    let currentStreak = userStats.currentStreak;
    let topStreak = userStats.topStreak;
    let isTopStreakUpdated = false;

    // 2. Logika Streak
    if (userStats.totalChallenges === 0) {
      currentStreak = 1;
    } else {
      const diffDays = today.diff(lastUpdatedDay, 'days');
      if (diffDays === 1) {
        currentStreak++;
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
    }

    if (currentStreak > topStreak) {
      topStreak = currentStreak;
      isTopStreakUpdated = true;
    }

    // 3. Perbarui UserStats (Poin ditambahkan di awal)
    const updatedStats = await tx.userStats.update({
      where: { userId },
      data: {
        totalPoints: { increment: pointsEarn },
        totalChallenges: { increment: 1 },
        currentStreak: currentStreak,
        topStreak: topStreak
      }
    });

    // 4. Buat entri ActivityHistory dengan status PENDING
    await tx.activityHistory.create({
      data: {
        userId,
        eventType,
        pointsEarn,
        pointsFrom: userStats.totalPoints,
        pointsTo: updatedStats.totalPoints,
        submissionImageUrl: imageUrl,
        status: PurchaseStatus.PENDING
      }
    });

    return {
      message: 'Activity saved and is pending review.',
      pointsEarned: pointsEarn,
      streakStatus: {
        currentStreak: updatedStats.currentStreak,
        isTopStreakUpdated
      }
    };
  });
};

const reviewActivitySubmission = async (
  activityId: number,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
) => {
  const activity = await prisma.activityHistory.findUnique({
    where: { id: activityId }
  });

  if (!activity) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Activity submission not found');
  }

  if (activity.status !== PurchaseStatus.PENDING) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This submission has already been ${activity.status.toLowerCase()}`
    );
  }

  if (status === PurchaseStatus.REJECTED) {
    await prisma.$transaction(async (tx) => {
      // Kurangi poin pengguna jika di-reject
      await tx.userStats.update({
        where: { userId: activity.userId },
        data: {
          totalPoints: {
            decrement: activity.pointsEarn
          }
        }
      });

      // Perbarui status aktivitas
      await tx.activityHistory.update({
        where: { id: activityId },
        data: {
          status: PurchaseStatus.REJECTED,
          rejectionReason,
          reviewedAt: new Date()
        }
      });
    });
  } else {
    // Jika di-approve, hanya perbarui statusnya
    await prisma.activityHistory.update({
      where: { id: activityId },
      data: {
        status: PurchaseStatus.APPROVED,
        reviewedAt: new Date()
      }
    });
  }
};

const queryActivitySubmissions = async (
  filter: { status?: PurchaseStatus; nameOrEmail?: string },
  options: {
    limit?: number;
    page?: number;
    sortBy?: string;
    sortType?: 'asc' | 'desc';
  }
) => {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const sortBy = options.sortBy ?? 'createdAt';
  const sortType = options.sortType ?? 'desc';

  const where: Prisma.ActivityHistoryWhereInput = {};
  const userFilter: Prisma.UserWhereInput = { isBanned: false };

  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.nameOrEmail) {
    userFilter.OR = [
      { name: { contains: filter.nameOrEmail, mode: 'insensitive' } },
      { email: { contains: filter.nameOrEmail, mode: 'insensitive' } }
    ];
  }

  where.user = userFilter;

  const [submissions, totalItems] = await prisma.$transaction([
    prisma.activityHistory.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortType }
    }),
    prisma.activityHistory.count({ where })
  ]);

  const totalPages = Math.ceil(totalItems / limit);
  return {
    data: submissions,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages
    }
  };
};

/**
 * Mendapatkan riwayat aktivitas untuk seorang pengguna dengan paginasi.
 * @param userId - ID pengguna.
 * @param options - Opsi paginasi (limit, page).
 * @returns {Promise<object>} - Hasil yang dipaginasi.
 */
const getActivityHistory = async (userId: number, options: { limit?: number; page?: number }) => {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  const [history, totalItems] = await Promise.all([
    prisma.activityHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.activityHistory.count({ where: { userId } })
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages
    },
    history: history
  };
};

/**
 * Menghitung total poin dari aktivitas 'INDIVIDUAL'.
 * @param {number} userId - ID Pengguna
 * @returns {Promise<number>} - Total poin
 */
const getUserIndividualReps = async (userId: number): Promise<number> => {
  const result = await prisma.activityHistory.aggregate({
    _sum: {
      pointsEarn: true
    },
    where: {
      userId,
      eventType: 'INDIVIDUAL',
      status: { in: ['APPROVED', 'PENDING'] } // DIUBAH: Sertakan PENDING
    }
  });
  return result._sum.pointsEarn || 0;
};

export default {
  saveActivity,
  getActivityHistory,
  getUserIndividualReps,
  reviewActivitySubmission,
  queryActivitySubmissions
};
