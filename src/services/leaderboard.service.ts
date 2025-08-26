import prisma from '../client';
import { Prisma } from '@prisma/client';

type Timespan = 'alltime' | 'weekly' | 'streak';

/**
 * Mendapatkan data leaderboard publik.
 * @param options - Opsi filter dan paginasi.
 * @returns {Promise<object>}
 */
const getPublicLeaderboard = async (options: {
  timespan?: Timespan;
  region?: string;
  page?: number;
  limit?: number;
}) => {
  const { timespan = 'alltime', region, page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  let orderBy: Prisma.UserStatsOrderByWithRelationInput;

  switch (timespan) {
    case 'streak':
      orderBy = { topStreak: 'desc' };
      break;
    case 'weekly':
      orderBy = { weeklyPoints: 'desc' };
      break;
    default: // alltime
      orderBy = { totalPoints: 'desc' };
      break;
  }

  const where: Prisma.UserWhereInput = {};
  if (region) {
    where.country = region;
  }

  const totalItems = await prisma.user.count({ where });
  const totalPages = Math.ceil(totalItems / limit);

  const usersWithStats = await prisma.user.findMany({
    where,
    include: {
      stats: true
    },
    orderBy: {
      stats: orderBy
    },
    skip,
    take: limit
  });

  const leaderboard = usersWithStats.map((user, index) => {
    const rank = skip + index + 1;
    if (timespan === 'streak') {
      return {
        rank,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        streak: user.stats?.topStreak || 0
      };
    }

    // FIX: Konversi nilai Decimal ke number sebelum dikirim
    const points = timespan === 'weekly' ? user.stats?.weeklyPoints : user.stats?.totalPoints;

    return {
      rank,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      points: points ? parseFloat(points.toString()) : 0,
      reps: user.stats?.totalReps ? user.stats.totalReps.toString() : '0'
    };
  });

  return {
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages
    },
    leaderboard
  };
};

/**
 * Mendapatkan peringkat pengguna saat ini.
 * @param userId - ID pengguna.
 * @param options - Opsi filter.
 * @returns {Promise<object>}
 */
const getUserRank = async (userId: number, options: { timespan?: Timespan; region?: string }) => {
  const { timespan = 'alltime' } = options;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { stats: true }
  });

  if (!user || !user.stats) {
    return {
      rank: 0,
      username: user?.username || 'N/A',
      profilePictureUrl: user?.profilePictureUrl || null,
      points: 0,
      reps: '0',
      streak: 0
    };
  }

  const userStats = user.stats;
  let rank = 0;

  switch (timespan) {
    case 'streak':
      rank =
        (await prisma.userStats.count({
          where: { topStreak: { gt: userStats.topStreak } }
        })) + 1;
      return {
        rank,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        streak: userStats.topStreak
      };
    case 'weekly':
      rank =
        (await prisma.userStats.count({
          where: { weeklyPoints: { gt: userStats.weeklyPoints } }
        })) + 1;
      return {
        rank,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        points: parseFloat(userStats.weeklyPoints.toString()), // FIX: Konversi Decimal
        reps: userStats.totalReps.toString()
      };
    default: // alltime
      rank =
        (await prisma.userStats.count({
          where: { totalPoints: { gt: userStats.totalPoints } }
        })) + 1;
      return {
        rank,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        points: parseFloat(userStats.totalPoints.toString()), // FIX: Konversi Decimal
        reps: userStats.totalReps.toString()
      };
  }
};

export default {
  getPublicLeaderboard,
  getUserRank
};
