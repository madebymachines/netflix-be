import { Prisma, User } from '@prisma/client';
import prisma from '../client';
import { ActivityHistory } from '@prisma/client';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';
import moment from 'moment';

// ... (fungsi calculatePoints dan saveActivity tetap sama) ...
const calculatePoints = (reps: number, calories: number): Prisma.Decimal => {
  // Contoh sederhana: 1 poin per rep, 2 poin per kalori. Sesuaikan sesuai kebutuhan.
  const points = reps * 1.0 + calories * 2.0;
  return new Prisma.Decimal(points.toFixed(3));
};

const saveActivity = async (
  userId: number,
  activityBody: {
    eventType: 'INDIVIDUAL' | 'GROUP';
    reps: number;
    calories: number;
    description: string;
  }
) => {
  const { eventType, reps, calories, description } = activityBody;
  const pointsEarned = calculatePoints(reps, calories);
  const caloriesBurned = new Prisma.Decimal(calories.toFixed(3));

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

    const today = moment().startOf('day').toDate();
    const lastActivityDate = userStats.lastActivityDate
      ? moment(userStats.lastActivityDate).startOf('day').toDate()
      : null;

    let currentStreak = userStats.currentStreak;
    let topStreak = userStats.topStreak;
    let isTopStreakUpdated = false;

    // 2. Logika Streak
    if (lastActivityDate) {
      const diffDays = moment(today).diff(moment(lastActivityDate), 'days');
      if (diffDays === 1) {
        // Aktivitas hari berikutnya, lanjutkan streak
        currentStreak++;
      } else if (diffDays > 1) {
        // Melewatkan satu hari atau lebih, reset streak
        currentStreak = 1;
      }
      // Jika diffDays === 0, tidak ada perubahan pada streak
    } else {
      // Aktivitas pertama
      currentStreak = 1;
    }

    if (currentStreak > topStreak) {
      topStreak = currentStreak;
      isTopStreakUpdated = true;
    }

    // 3. Logika Reset Poin Mingguan
    const lastUpdatedWeek = moment(userStats.lastUpdated).isoWeek();
    const currentWeek = moment().isoWeek();
    const lastUpdatedYear = moment(userStats.lastUpdated).year();
    const currentYear = moment().year();

    let weeklyPoints = new Prisma.Decimal(userStats.weeklyPoints);
    if (currentYear > lastUpdatedYear || currentWeek > lastUpdatedWeek) {
      // Reset jika sudah minggu baru
      weeklyPoints = new Prisma.Decimal(0);
    }

    // 4. Perbarui UserStats
    const updatedStats = await tx.userStats.update({
      where: { userId },
      data: {
        totalPoints: { increment: pointsEarned },
        totalReps: { increment: reps },
        totalCaloriesBurned: { increment: caloriesBurned },
        weeklyPoints: weeklyPoints.add(pointsEarned),
        currentStreak: currentStreak,
        topStreak: topStreak,
        lastActivityDate: today,
        totalChallenges: { increment: 1 } // Asumsi satu aktivitas adalah satu tantangan
      }
    });

    // 5. Buat entri ActivityHistory
    await tx.activityHistory.create({
      data: {
        userId,
        eventType,
        pointsChange: pointsEarned,
        repsChange: reps,
        pointsFrom: userStats.totalPoints,
        pointsTo: updatedStats.totalPoints,
        repsFrom: userStats.totalReps,
        repsTo: updatedStats.totalReps,
        caloriesBurned,
        description
      }
    });

    return {
      message: 'Activity saved successfully.',
      pointsEarned: parseFloat(pointsEarned.toString()),
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

  // FIX: Mengonversi BigInt dan Decimal ke tipe yang dapat diserialisasi JSON
  const serializedHistory = history.map((item) => ({
    ...item,
    id: item.id.toString(), // Konversi id (BigInt) ke string
    pointsChange: parseFloat(item.pointsChange.toString()),
    pointsFrom: parseFloat(item.pointsFrom.toString()),
    pointsTo: parseFloat(item.pointsTo.toString()),
    repsFrom: item.repsFrom.toString(), // Konversi repsFrom (BigInt) ke string
    repsTo: item.repsTo.toString(), // Konversi repsTo (BigInt) ke string
    caloriesBurned: item.caloriesBurned ? parseFloat(item.caloriesBurned.toString()) : null
  }));

  return {
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages
    },
    history: serializedHistory
  };
};

export default {
  saveActivity,
  getActivityHistory
};
