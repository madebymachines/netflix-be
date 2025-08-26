import prisma from '../client';
import { Prisma } from '@prisma/client';

type Timespan = 'alltime' | 'streak'; // 'weekly' dihapus

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

    // 'alltime'
    return {
      rank,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      points: user.stats?.totalPoints || 0
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
    default: // alltime
      rank =
        (await prisma.userStats.count({
          where: { totalPoints: { gt: userStats.totalPoints } }
        })) + 1;
      return {
        rank,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        points: userStats.totalPoints
      };
  }
};

export default {
  getPublicLeaderboard,
  getUserRank
};
