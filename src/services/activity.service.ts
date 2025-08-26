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
    // Cek jika ini adalah aktivitas pertama pengguna
    if (userStats.totalChallenges === 0) {
      currentStreak = 1;
    } else {
      const diffDays = today.diff(lastUpdatedDay, 'days');
      if (diffDays === 1) {
        // Aktivitas hari berikutnya, lanjutkan streak
        currentStreak++;
      } else if (diffDays > 1) {
        // Melewatkan satu hari atau lebih, reset streak
        currentStreak = 1;
      }
      // Jika diffDays === 0, berarti aktivitas lain di hari yang sama,
      // maka currentStreak tidak perlu diubah.
    }

    // Perbarui topStreak jika currentStreak saat ini lebih tinggi
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

export default {
  saveActivity,
  getActivityHistory
};
