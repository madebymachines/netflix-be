import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync';
import { User } from '@prisma/client';
import { leaderboardService, s3Service } from '../services';
import pick from '../utils/pick';
import config from '../config/config';

async function signS3IfNeeded(
  raw?: string | null,
  expiresSec = 600
): Promise<string | null | undefined> {
  if (!raw) return raw;

  const BUCKET = config.aws.s3.bucketName;
  const REGION = config.aws.s3.region;

  try {
    let key: string | null = null;
    const s3Prefix = `s3://${BUCKET}/`;
    if (raw.startsWith(s3Prefix)) {
      key = raw.slice(s3Prefix.length);
    } else {
      const u = new URL(raw);
      const isS3Host = u.hostname === `${BUCKET}.s3.${REGION}.amazonaws.com`;
      const isAlreadySigned = u.searchParams.has('X-Amz-Algorithm');
      if (isS3Host && !isAlreadySigned) {
        key = u.pathname.replace(/^\/+/, '');
      }
    }

    if (key) {
      return await s3Service.getPresignedUrl(key, expiresSec);
    }
  } catch {
    // Abaikan error parse URL, biarkan ra
  }
  return raw;
}

const getLeaderboard = catchAsync(async (req, res) => {
  const options = pick(req.query, ['timespan', 'region', 'page', 'limit', 'startDate', 'endDate']);
  const result = await leaderboardService.getPublicLeaderboard(options);
  const leaderboard = await Promise.all(
    (result.leaderboard ?? []).map(async (row: any) => ({
      ...row,
      profilePictureUrl: await signS3IfNeeded(row.profilePictureUrl)
    }))
  );
  res.status(httpStatus.OK).send({ ...result, leaderboard });
});

const getMyRank = catchAsync(async (req, res) => {
  const user = req.user as User;
  const options = pick(req.query, ['timespan', 'region']);
  const result: any = await leaderboardService.getUserRank(user.id, options);

  if ('profilePictureUrl' in result) {
    result.profilePictureUrl = await signS3IfNeeded(result.profilePictureUrl);
  }

  if (Array.isArray(result.around)) {
    result.around = await Promise.all(
      result.around.map(async (row: any) => ({
        ...row,
        profilePictureUrl: await signS3IfNeeded(row.profilePictureUrl)
      }))
    );
  }

  if (Array.isArray(result.leaderboard)) {
    result.leaderboard = await Promise.all(
      result.leaderboard.map(async (row: any) => ({
        ...row,
        profilePictureUrl: await signS3IfNeeded(row.profilePictureUrl)
      }))
    );
  }

  res.status(httpStatus.OK).send(result);
});

export default {
  getLeaderboard,
  getMyRank
};
