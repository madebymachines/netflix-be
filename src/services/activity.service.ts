import { Prisma, PurchaseStatus, User } from '@prisma/client';
import prisma from '../client';
import moment from 'moment';
import s3Service from './s3.service';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';
import { sanitizeImageOrThrow } from '../utils/imageGuard';
import config from '../config/config';
import logger from '../config/logger'; // <-- IMPORT BARU

/**
 * Menyimpan aktivitas baru, memperbarui statistik pengguna, dan menerapkan pemeriksaan anti-cheat.
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
  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission image is required');
  }

  const { eventType, pointsEarn: originalPointsEarn } = activityBody;
  const MAX_POINTS = 150;

  // helper untuk hapus by key via deleteByUrl (service kamu menerima URL)
  const httpsUrlForKey = (key: string) =>
    `https://${config.aws.s3.bucketName}.s3.${config.aws.s3.region}.amazonaws.com/${key}`;

  let uploadedKey: string | null = null;

  try {
    // 1) Validasi signature + re-encode
    const { bufferBersih, mimeFinal, extFinal } = await sanitizeImageOrThrow(file.buffer);

    // 2) Upload PRIVATE ke S3 (nama acak)
    const { key } = await s3Service.uploadPrivateFile(
      bufferBersih,
      extFinal,
      mimeFinal,
      'submission'
    );
    uploadedKey = key;

    // 3) Simpan identifier (bukan URL publik)
    const imageUrl = `s3://${config.aws.s3.bucketName}/${key}`;

    // 4) Semua operasi DB dalam satu transaksi
    return await prisma.$transaction(async (tx) => {
      let isFlagged = false;
      const flagReasons: string[] = [];

      // Sanity cap points
      let finalPointsEarn = originalPointsEarn;
      if (originalPointsEarn > MAX_POINTS) {
        finalPointsEarn = MAX_POINTS;
        flagReasons.push(
          `Extreme points submitted: requested ${originalPointsEarn}, capped at ${MAX_POINTS}.`
        );
      }

      // Drastic increase detection (vs 7-day average)
      const sevenDaysAgo = moment().subtract(7, 'days').startOf('day').toDate();
      const todayStart = moment().startOf('day').toDate();

      const pastActivities = await tx.activityHistory.findMany({
        where: {
          userId,
          createdAt: { gte: sevenDaysAgo, lt: todayStart },
          status: { not: 'REJECTED' }
        }
      });

      const dailyPoints: Record<string, number> = {};
      pastActivities.forEach((a) => {
        const day = moment(a.createdAt).format('YYYY-MM-DD');
        dailyPoints[day] = (dailyPoints[day] || 0) + a.pointsEarn;
      });

      const numDaysWithActivity = Object.keys(dailyPoints).length;
      const totalPastPoints = Object.values(dailyPoints).reduce((s, p) => s + p, 0);
      const averageDailyPoints =
        numDaysWithActivity > 0 ? totalPastPoints / numDaysWithActivity : 0;

      const todayActivities = await tx.activityHistory.findMany({
        where: {
          userId,
          createdAt: { gte: todayStart },
          status: { not: 'REJECTED' }
        }
      });
      const pointsSoFarToday = todayActivities.reduce((s, a) => s + a.pointsEarn, 0);
      const projectedTodayTotal = pointsSoFarToday + finalPointsEarn;

      if (averageDailyPoints > 10 && projectedTodayTotal > averageDailyPoints * 10) {
        flagReasons.push(
          `Drastic daily increase: today's ${projectedTodayTotal} vs avg ${averageDailyPoints.toFixed(
            0
          )}.`
        );
      }

      // Perfect consistency (10 submissions sama)
      const recentActivities = await tx.activityHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 9
      });
      if (recentActivities.length === 9) {
        const allSame = recentActivities.every((a) => a.pointsEarn === finalPointsEarn);
        if (allSame && finalPointsEarn > 0) {
          flagReasons.push(
            `Perfect consistency: last 10 submissions had ${finalPointsEarn} points.`
          );
        }
      }

      // Rapid submission (velocity)
      const lastActivity = await tx.activityHistory.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
      if (lastActivity) {
        const secondsSinceLast = moment().diff(moment(lastActivity.createdAt), 'seconds');
        const THRESHOLD = 60;
        if (secondsSinceLast < THRESHOLD) {
          flagReasons.push(
            `Rapid submission: new activity submitted ${secondsSinceLast}s after the previous one.`
          );
        }
      }

      if (flagReasons.length > 0) isFlagged = true;

      // Ambil/siapkan userStats
      let userStats = await tx.userStats.findUnique({ where: { userId } });
      if (!userStats) userStats = await tx.userStats.create({ data: { userId } });

      // Streak logic
      const today = moment().startOf('day');
      const lastUpdatedDay = moment(userStats.lastUpdated).startOf('day');
      let currentStreak = userStats.currentStreak;
      let topStreak = userStats.topStreak;
      let isTopStreakUpdated = false;

      if (userStats.totalChallenges === 0) {
        currentStreak = 1;
      } else {
        const diffDays = today.diff(lastUpdatedDay, 'days');
        if (diffDays === 1) currentStreak++;
        else if (diffDays > 1) currentStreak = 1;
      }

      if (currentStreak > topStreak) {
        topStreak = currentStreak;
        isTopStreakUpdated = true;
      }

      // Update stats pakai poin final
      const updatedStats = await tx.userStats.update({
        where: { userId },
        data: {
          totalPoints: { increment: finalPointsEarn },
          totalChallenges: { increment: 1 },
          currentStreak,
          topStreak
        }
      });

      const submissionStatus =
        eventType === 'INDIVIDUAL' ? PurchaseStatus.APPROVED : PurchaseStatus.PENDING;
      const message =
        eventType === 'INDIVIDUAL'
          ? 'Activity saved successfully.'
          : 'Activity saved and is pending review.';

      // Simpan ActivityHistory
      await tx.activityHistory.create({
        data: {
          userId,
          eventType,
          pointsEarn: finalPointsEarn,
          pointsFrom: userStats.totalPoints,
          pointsTo: updatedStats.totalPoints,
          submissionImageUrl: imageUrl,
          status: submissionStatus,
          reviewedAt: submissionStatus === PurchaseStatus.APPROVED ? new Date() : null,
          isFlagged,
          flagReason: flagReasons.join(' | ')
        }
      });

      return {
        message,
        pointsEarned: finalPointsEarn,
        streakStatus: {
          currentStreak: updatedStats.currentStreak,
          isTopStreakUpdated
        }
      };
    });
  } catch (err) {
    if (uploadedKey) {
      await s3Service.deleteByUrl(httpsUrlForKey(uploadedKey)).catch((deleteError) => {
        
        logger.error(
          `Failed to delete orphaned S3 object [${uploadedKey}] after an error:`,
          deleteError
        );
      });
    }
    throw err;
  }
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
      // Kurangi poin dan total tantangan pengguna jika di-reject
      await tx.userStats.update({
        where: { userId: activity.userId },
        data: {
          totalPoints: {
            decrement: activity.pointsEarn
          },
          totalChallenges: {
            decrement: 1
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
  filter: {
    status?: PurchaseStatus;
    nameOrEmail?: string;
    eventType?: 'INDIVIDUAL' | 'GROUP';
    country?: string;
    dateRange?: { from: Date; to: Date };
    isFlagged?: boolean;
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

  const where: Prisma.ActivityHistoryWhereInput = {
    user: {
      isBanned: false
    }
  };

  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.eventType) {
    where.eventType = filter.eventType;
  }
  if (filter.country) {
    (where.user as Prisma.UserWhereInput).country = filter.country;
  }
  if (filter.isFlagged !== undefined) {
    where.isFlagged = filter.isFlagged;
  }
  if (filter.nameOrEmail) {
    if (where.user && typeof where.user === 'object') {
      where.user.OR = [
        { username: { contains: filter.nameOrEmail, mode: 'insensitive' } },
        { email: { contains: filter.nameOrEmail, mode: 'insensitive' } }
      ];
    }
  }
  if (filter.dateRange) {
    where.createdAt = {
      gte: filter.dateRange.from,
      lte: filter.dateRange.to
    };
  }

  const findManyArgs: Prisma.ActivityHistoryFindManyArgs = {
    where,
    include: {
      user: {
        select: { id: true, username: true, email: true }
      }
    },
    orderBy: { [sortBy]: sortType }
  };

  if (!fetchAll) {
    findManyArgs.skip = (page - 1) * limit;
    findManyArgs.take = limit;
  }

  const [submissions, totalItems] = await prisma.$transaction([
    prisma.activityHistory.findMany(findManyArgs),
    prisma.activityHistory.count({ where })
  ]);

  const totalPages = fetchAll ? 1 : Math.ceil(totalItems / limit);
  return {
    data: submissions,
    pagination: {
      currentPage: page,
      limit: fetchAll ? totalItems : limit,
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
      status: { in: ['APPROVED', 'PENDING'] }
    }
  });
  return result._sum.pointsEarn || 0;
};

const getWeeklyWorkoutStats = async (user: User) => {
  const startOfWeek = moment().startOf('isoWeek').toDate();
  const endOfWeek = moment().endOf('isoWeek').toDate();

  const activitiesThisWeek = await prisma.activityHistory.findMany({
    where: {
      userId: user.id,
      createdAt: {
        gte: startOfWeek,
        lte: endOfWeek
      },
      status: { in: ['APPROVED', 'PENDING'] }
    },
    select: {
      createdAt: true
    }
  });

  const weekly = {
    senin: 0,
    selasa: 0,
    rabu: 0,
    kamis: 0,
    jumat: 0,
    sabtu: 0,
    minggu: 0
  };

  const dayMapping: { [key: number]: keyof typeof weekly } = {
    1: 'senin',
    2: 'selasa',
    3: 'rabu',
    4: 'kamis',
    5: 'jumat',
    6: 'sabtu',
    7: 'minggu'
  };

  activitiesThisWeek.forEach((activity) => {
    const dayOfWeek = moment(activity.createdAt).isoWeekday(); // 1 for Monday, 7 for Sunday
    const dayName = dayMapping[dayOfWeek];
    if (dayName) {
      weekly[dayName]++;
    }
  });

  // Calculate averages
  const daysSinceRegistration = Math.max(1, moment().diff(moment(user.createdAt), 'days') + 1);
  const weeksSinceRegistration = Math.max(1, Math.ceil(daysSinceRegistration / 7));

  const totalIndividualReps = await getUserIndividualReps(user.id);
  const userStats = await prisma.userStats.findUnique({ where: { userId: user.id } });
  const totalChallenges = userStats?.totalChallenges || 0;

  const averageRepsPerDay = totalIndividualReps / daysSinceRegistration;
  const averageChallengePerWeek = totalChallenges / weeksSinceRegistration;

  return {
    weekly,
    averageRepsPerDay: parseFloat(averageRepsPerDay.toFixed(2)),
    averageChallengePerWeek: parseFloat(averageChallengePerWeek.toFixed(2))
  };
};

export default {
  saveActivity,
  getActivityHistory,
  getUserIndividualReps,
  reviewActivitySubmission,
  queryActivitySubmissions,
  getWeeklyWorkoutStats
};
