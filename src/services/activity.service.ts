import { Prisma, User } from '@prisma/client';
import prisma from '../client';
import moment from 'moment';

/**
 * Menyimpan aktivitas baru dan memperbarui statistik pengguna.
 * @param userId - ID pengguna.
 * @param activityBody - Detail aktivitas.
 * @returns {Promise<object>}
 */
const saveActivity = async (
  userId: number,
  activityBody: {
    eventType: 'INDIVIDUAL' | 'GROUP';
    pointsEarn: number;
  }
) => {
  const { eventType, pointsEarn } = activityBody;

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

    // 3. Perbarui UserStats
    const updatedStats = await tx.userStats.update({
      where: { userId },
      data: {
        totalPoints: { increment: pointsEarn },
        totalChallenges: { increment: 1 },
        currentStreak: currentStreak,
        topStreak: topStreak
      }
    });

    // 4. Buat entri ActivityHistory
    await tx.activityHistory.create({
      data: {
        userId,
        eventType,
        pointsEarn,
        pointsFrom: userStats.totalPoints,
        pointsTo: updatedStats.totalPoints
      }
    });

    return {
      message: 'Activity saved successfully.',
      pointsEarned: pointsEarn,
      streakStatus: {
        currentStreak: updatedStats.currentStreak,
        isTopStreakUpdated
      }
    };
  });
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
      eventType: 'INDIVIDUAL'
    }
  });
  return result._sum.pointsEarn || 0;
};

export default {
  saveActivity,
  getActivityHistory,
  getUserIndividualReps
};
