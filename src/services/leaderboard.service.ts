import prisma from '../client';
import { Prisma } from '@prisma/client';
import moment from 'moment';

type Timespan = 'alltime' | 'streak' | 'weekly';

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

  if (timespan === 'weekly') {
    const startOfWeek = moment().startOf('isoWeek').toDate(); // Mulai dari hari Senin 00:00:00
    const endOfWeek = moment().endOf('isoWeek').toDate(); // Berakhir pada hari Minggu 23:59:59

    const whereClause: Prisma.ActivityHistoryWhereInput = {
      createdAt: { gte: startOfWeek, lte: endOfWeek }
    };
    if (region) {
      whereClause.user = { country: region };
    }

    const weeklyLeadersAggregate = await prisma.activityHistory.groupBy({
      by: ['userId'],
      where: whereClause,
      _sum: { pointsEarn: true },
      orderBy: { _sum: { pointsEarn: 'desc' } },
      skip,
      take: limit
    });

    const totalItemsAggregate = await prisma.activityHistory.groupBy({
      by: ['userId'],
      where: whereClause
    });
    const totalItems = totalItemsAggregate.length;
    const totalPages = Math.ceil(totalItems / limit);

    const userIds = weeklyLeadersAggregate.map((u) => u.userId);
    if (userIds.length === 0) {
      return {
        pagination: { currentPage: page, limit, totalItems, totalPages },
        leaderboard: []
      };
    }

    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    const usersMap = users.reduce((map, user) => {
      map[user.id] = user;
      return map;
    }, {} as Record<number, typeof users[0]>);

    const totalRepsData = await prisma.activityHistory.groupBy({
      by: ['userId'],
      _sum: { pointsEarn: true },
      where: { userId: { in: userIds }, eventType: 'INDIVIDUAL' }
    });
    const repsMap = totalRepsData.reduce((map, item) => {
      map[item.userId] = item._sum.pointsEarn || 0;
      return map;
    }, {} as Record<number, number>);

    const leaderboard = weeklyLeadersAggregate.map((agg, index) => {
      const user = usersMap[agg.userId];
      return {
        rank: skip + index + 1,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        country: user.country,
        totalReps: repsMap[user.id] || 0,
        points: agg._sum.pointsEarn || 0
      };
    });

    return {
      pagination: { currentPage: page, limit, totalItems, totalPages },
      leaderboard
    };
  }

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
    include: { stats: true },
    orderBy: { stats: orderBy },
    skip,
    take: limit
  });

  const userIds = usersWithStats.map((u) => u.id);
  const totalRepsData = await prisma.activityHistory.groupBy({
    by: ['userId'],
    _sum: { pointsEarn: true },
    where: { userId: { in: userIds }, eventType: 'INDIVIDUAL' }
  });
  const repsMap = totalRepsData.reduce((map, item) => {
    map[item.userId] = item._sum.pointsEarn || 0;
    return map;
  }, {} as Record<number, number>);

  const leaderboard = usersWithStats.map((user, index) => {
    const rank = skip + index + 1;
    const commonData = {
      rank,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      country: user.country,
      totalReps: repsMap[user.id] || 0
    };

    if (timespan === 'streak') {
      return {
        ...commonData,
        streak: user.stats?.topStreak || 0
      };
    }

    return {
      ...commonData,
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
      country: user?.country || null,
      points: 0,
      streak: 0,
      totalReps: 0
    };
  }

  const userReps = await prisma.activityHistory.aggregate({
    _sum: { pointsEarn: true },
    where: { userId, eventType: 'INDIVIDUAL' }
  });
  const totalReps = userReps._sum.pointsEarn || 0;

  let rank = 0;
  const commonData = {
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
    country: user.country,
    totalReps
  };

  switch (timespan) {
    case 'weekly': {
      const startOfWeek = moment().startOf('isoWeek').toDate();
      const endOfWeek = moment().endOf('isoWeek').toDate();

      const userWeeklyPoints = await prisma.activityHistory.aggregate({
        _sum: { pointsEarn: true },
        where: { userId, createdAt: { gte: startOfWeek, lte: endOfWeek } }
      });
      const userScore = userWeeklyPoints._sum.pointsEarn || 0;

      const rankAggregate = await prisma.activityHistory.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: startOfWeek, lte: endOfWeek } },
        _sum: { pointsEarn: true },
        having: {
          pointsEarn: {
            _sum: {
              gt: userScore
            }
          }
        }
      });
      rank = rankAggregate.length + 1;
      return { ...commonData, rank, points: userScore };
    }
    case 'streak':
      rank =
        (await prisma.userStats.count({
          where: { topStreak: { gt: user.stats.topStreak } }
        })) + 1;
      return { ...commonData, rank, streak: user.stats.topStreak };
    default: // alltime
      rank =
        (await prisma.userStats.count({
          where: { totalPoints: { gt: user.stats.totalPoints } }
        })) + 1;
      return { ...commonData, rank, points: user.stats.totalPoints };
  }
};

export default {
  getPublicLeaderboard,
  getUserRank
};
