import prisma from '../client';
import { Prisma } from '@prisma/client';
import moment from 'moment';

type Timespan = 'alltime' | 'streak' | 'weekly' | 'monthly';

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
  fetchAll?: boolean;
}) => {
  const { timespan = 'alltime', region, page = 1, limit = 20, fetchAll = false } = options;
  const skip = fetchAll ? 0 : (page - 1) * limit;
  const take = fetchAll ? undefined : limit;

  if (timespan === 'weekly' || timespan === 'monthly') {
    const startOfPeriod =
      timespan === 'weekly'
        ? moment().startOf('isoWeek').toDate()
        : moment().startOf('month').toDate();
    const endOfPeriod =
      timespan === 'weekly' ? moment().endOf('isoWeek').toDate() : moment().endOf('month').toDate();

    const userFilter: Prisma.UserWhereInput = { isBanned: false };
    if (region) {
      userFilter.country = region;
    }

    const whereClause: Prisma.ActivityHistoryWhereInput = {
      user: userFilter,
      status: { in: ['APPROVED', 'PENDING'] },
      createdAt: { gte: startOfPeriod, lte: endOfPeriod }
    };

    const periodLeadersAggregate = await prisma.activityHistory.groupBy({
      by: ['userId'],
      where: whereClause,
      _sum: { pointsEarn: true },
      orderBy: [{ _sum: { pointsEarn: 'desc' } }, { userId: 'asc' }],
      skip,
      take
    });

    const totalItemsAggregate = await prisma.activityHistory.groupBy({
      by: ['userId'],
      where: whereClause
    });
    const totalItems = totalItemsAggregate.length;
    const totalPages = fetchAll ? 1 : Math.ceil(totalItems / limit);

    const userIds = periodLeadersAggregate.map((u) => u.userId);
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
      where: {
        userId: { in: userIds },
        eventType: 'INDIVIDUAL',
        status: { in: ['APPROVED', 'PENDING'] },
        createdAt: { gte: startOfPeriod, lte: endOfPeriod }
      }
    });
    const repsMap = totalRepsData.reduce<Record<number, number>>((map, item) => {
      map[item.userId] = item._sum.pointsEarn || 0;
      return map;
    }, {});

    const leaderboard = periodLeadersAggregate.map((agg, index) => {
      const user = usersMap[agg.userId];
      return {
        userId: user.id,
        rank: skip + index + 1,
        username: user.username,
        profilePictureUrl: user.profilePictureUrl,
        country: user.country,
        gender: user.gender,
        totalReps: repsMap[user.id] || 0,
        points: agg._sum.pointsEarn || 0
      };
    });

    return {
      pagination: {
        currentPage: page,
        limit: fetchAll ? totalItems : limit,
        totalItems,
        totalPages
      },
      leaderboard
    };
  }

  let orderBy: Prisma.UserStatsOrderByWithRelationInput[];
  switch (timespan) {
    case 'streak':
      orderBy = [{ topStreak: 'desc' }, { lastUpdated: 'asc' }];
      break;
    default: // alltime
      orderBy = [{ totalPoints: 'desc' }, { lastUpdated: 'asc' }];
      break;
  }

  const userStatsFilter: Prisma.UserWhereInput = { isBanned: false };
  if (region) {
    userStatsFilter.country = region;
  }

  const whereUserStats: Prisma.UserStatsWhereInput = {
    user: userStatsFilter
  };

  const totalItems = await prisma.userStats.count({ where: whereUserStats });
  const totalPages = fetchAll ? 1 : Math.ceil(totalItems / limit);

  const userStats = await prisma.userStats.findMany({
    where: whereUserStats,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          profilePictureUrl: true,
          country: true,
          gender: true
        }
      }
    },
    orderBy: orderBy,
    skip,
    take
  });

  const userIds = userStats.map((s) => s.userId);
  let repsMap: Record<number, number> = {};

  if (timespan === 'alltime' && userIds.length > 0) {
    const totalRepsData = await prisma.activityHistory.groupBy({
      by: ['userId'],
      _sum: { pointsEarn: true },
      where: {
        userId: { in: userIds },
        eventType: 'INDIVIDUAL',
        status: { in: ['APPROVED', 'PENDING'] }
      }
    });
    repsMap = totalRepsData.reduce<Record<number, number>>((map, item) => {
      map[item.userId] = item._sum.pointsEarn || 0;
      return map;
    }, {});
  }

  const leaderboard = userStats
    .map((stat, index) => {
      const rank = skip + index + 1;
      if (!stat.user) {
        return null;
      }
      const commonData = {
        userId: stat.user.id,
        rank,
        username: stat.user.username,
        profilePictureUrl: stat.user.profilePictureUrl,
        country: stat.user.country,
        gender: stat.user.gender
      };

      if (timespan === 'streak') {
        return {
          ...commonData,
          streak: stat.topStreak || 0
        };
      }

      return {
        ...commonData,
        points: stat.totalPoints || 0,
        totalReps: repsMap[stat.userId] || 0
      };
    })
    .filter(Boolean);

  return {
    pagination: {
      currentPage: page,
      limit: fetchAll ? totalItems : limit,
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

  const baseResponseNoUser = {
    rank: 0,
    username: 'N/A',
    profilePictureUrl: null,
    country: null,
    gender: null
  };

  if (!user || user.isBanned) {
    if (timespan === 'streak') return { ...baseResponseNoUser, streak: 0 };
    return { ...baseResponseNoUser, points: 0, totalReps: 0 };
  }

  const commonData = {
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
    country: user.country,
    gender: user.gender
  };

  if (!user.stats) {
    const baseResponse = { ...commonData, rank: 0 };
    if (timespan === 'streak') return { ...baseResponse, streak: 0 };

    let totalReps = 0;
    if (timespan === 'alltime' || timespan === 'weekly' || timespan === 'monthly') {
      totalReps =
        (
          await prisma.activityHistory.aggregate({
            _sum: { pointsEarn: true },
            where: { userId, eventType: 'INDIVIDUAL', status: { in: ['APPROVED', 'PENDING'] } }
          })
        )._sum.pointsEarn || 0;
    }
    return { ...baseResponse, points: 0, totalReps };
  }

  let rank = 0;

  switch (timespan) {
    case 'weekly':
    case 'monthly': {
      const startOfPeriod =
        timespan === 'weekly'
          ? moment().startOf('isoWeek').toDate()
          : moment().startOf('month').toDate();
      const endOfPeriod =
        timespan === 'weekly'
          ? moment().endOf('isoWeek').toDate()
          : moment().endOf('month').toDate();

      const userPeriodPoints = await prisma.activityHistory.aggregate({
        _sum: { pointsEarn: true },
        where: {
          userId,
          status: { in: ['APPROVED', 'PENDING'] },
          createdAt: { gte: startOfPeriod, lte: endOfPeriod }
        }
      });
      const userScore = userPeriodPoints._sum.pointsEarn || 0;

      const allScores = await prisma.activityHistory.groupBy({
        by: ['userId'],
        where: {
          user: { isBanned: false },
          status: { in: ['APPROVED', 'PENDING'] },
          createdAt: { gte: startOfPeriod, lte: endOfPeriod }
        },
        _sum: { pointsEarn: true },
        orderBy: [{ _sum: { pointsEarn: 'desc' } }, { userId: 'asc' }]
      });

      const userRankIndex = allScores.findIndex((score) => score.userId === userId);
      rank = userRankIndex !== -1 ? userRankIndex + 1 : allScores.length + 1;

      const userPeriodReps = await prisma.activityHistory.aggregate({
        _sum: { pointsEarn: true },
        where: {
          userId,
          eventType: 'INDIVIDUAL',
          status: { in: ['APPROVED', 'PENDING'] },
          createdAt: { gte: startOfPeriod, lte: endOfPeriod }
        }
      });

      return {
        ...commonData,
        rank,
        points: userScore,
        totalReps: userPeriodReps._sum.pointsEarn || 0
      };
    }
    case 'streak':
      rank =
        (await prisma.userStats.count({
          where: {
            user: { isBanned: false },
            OR: [
              { topStreak: { gt: user.stats.topStreak } },
              {
                topStreak: user.stats.topStreak,
                lastUpdated: { lt: user.stats.lastUpdated }
              }
            ]
          }
        })) + 1;
      return { ...commonData, rank, streak: user.stats.topStreak };

    default: {
      // alltime
      rank =
        (await prisma.userStats.count({
          where: {
            user: { isBanned: false },
            OR: [
              { totalPoints: { gt: user.stats.totalPoints } },
              {
                totalPoints: user.stats.totalPoints,
                lastUpdated: { lt: user.stats.lastUpdated }
              }
            ]
          }
        })) + 1;

      const userTotalReps = await prisma.activityHistory.aggregate({
        _sum: { pointsEarn: true },
        where: { userId, eventType: 'INDIVIDUAL', status: { in: ['APPROVED', 'PENDING'] } }
      });

      return {
        ...commonData,
        rank,
        points: user.stats.totalPoints,
        totalReps: userTotalReps._sum.pointsEarn || 0
      };
    }
  }
};

export default {
  getPublicLeaderboard,
  getUserRank
};
