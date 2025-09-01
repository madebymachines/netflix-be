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

    // FIX: Menghitung totalReps hanya untuk rentang waktu mingguan
    const totalRepsData = await prisma.activityHistory.groupBy({
      by: ['userId'],
      _sum: { pointsEarn: true },
      where: {
        userId: { in: userIds },
        eventType: 'INDIVIDUAL',
        createdAt: { gte: startOfWeek, lte: endOfWeek } // Ditambahkan filter waktu
      }
    });
    const repsMap = totalRepsData.reduce<Record<number, number>>((map, item) => {
      map[item.userId] = item._sum.pointsEarn || 0;
      return map;
    }, {});

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

  // Logika untuk 'alltime' dan 'streak'
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
  let repsMap: Record<number, number> = {};

  // FIX: Hanya hitung totalReps jika timespan adalah 'alltime'
  if (timespan === 'alltime') {
    const totalRepsData = await prisma.activityHistory.groupBy({
      by: ['userId'],
      _sum: { pointsEarn: true },
      where: { userId: { in: userIds }, eventType: 'INDIVIDUAL' }
    });
    repsMap = totalRepsData.reduce<Record<number, number>>((map, item) => {
      map[item.userId] = item._sum.pointsEarn || 0;
      return map;
    }, {});
  }

  const leaderboard = usersWithStats.map((user, index) => {
    const rank = skip + index + 1;
    const commonData = {
      rank,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      country: user.country
    };

    if (timespan === 'streak') {
      return {
        ...commonData,
        streak: user.stats?.topStreak || 0
      };
    }

    // Default to 'alltime'
    return {
      ...commonData,
      points: user.stats?.totalPoints || 0,
      totalReps: repsMap[user.id] || 0
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

  if (!user) {
    const baseResponse = {
      rank: 0,
      username: 'N/A',
      profilePictureUrl: null,
      country: null
    };
    if (timespan === 'streak') {
      return { ...baseResponse, streak: 0 };
    }
    return { ...baseResponse, points: 0, totalReps: 0 };
  }

  const commonData = {
    username: user.username,
    profilePictureUrl: user.profilePictureUrl,
    country: user.country
  };

  if (!user.stats) {
    const baseResponse = { ...commonData, rank: 0 };
    if (timespan === 'streak') return { ...baseResponse, streak: 0 };

    // Untuk alltime/weekly tanpa stats, points adalah 0, totalReps harus dihitung
    let totalReps = 0;
    if (timespan === 'alltime' || timespan === 'weekly') {
      totalReps =
        (
          await prisma.activityHistory.aggregate({
            _sum: { pointsEarn: true },
            where: { userId, eventType: 'INDIVIDUAL' }
          })
        )._sum.pointsEarn || 0;
    }
    return { ...baseResponse, points: 0, totalReps };
  }

  let rank = 0;

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
        having: { pointsEarn: { _sum: { gt: userScore } } }
      });
      rank = rankAggregate.length + 1;

      // FIX: Menghitung totalReps mingguan untuk myRank
      const userWeeklyReps = await prisma.activityHistory.aggregate({
        _sum: { pointsEarn: true },
        where: {
          userId,
          eventType: 'INDIVIDUAL',
          createdAt: { gte: startOfWeek, lte: endOfWeek }
        }
      });

      return {
        ...commonData,
        rank,
        points: userScore,
        totalReps: userWeeklyReps._sum.pointsEarn || 0
      };
    }
    case 'streak':
      rank =
        (await prisma.userStats.count({
          where: { topStreak: { gt: user.stats.topStreak } }
        })) + 1;
      return { ...commonData, rank, streak: user.stats.topStreak };

    default: {
      // alltime
      rank =
        (await prisma.userStats.count({
          where: { totalPoints: { gt: user.stats.totalPoints } }
        })) + 1;

      // FIX: Menghitung totalReps all-time untuk myRank
      const userTotalReps = await prisma.activityHistory.aggregate({
        _sum: { pointsEarn: true },
        where: { userId, eventType: 'INDIVIDUAL' }
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
