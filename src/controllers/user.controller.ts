import httpStatus from 'http-status';
import pick from '../utils/pick';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { userService, s3Service, activityService } from '../services';
import { User, PurchaseStatus } from '@prisma/client';
import exclude from '../utils/exclude';
import prisma from '../client';
import { Request } from 'express';
import { sanitizeImageOrThrow } from '../utils/imageGuard';
import config from '../config/config';

const createUser = catchAsync(async (req, res) => {
  const { email, password, username, country } = req.body;
  const user = await userService.createUser({
    email,
    password,
    username,
    country
  });
  res.status(httpStatus.CREATED).send(exclude(user, ['password']));
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getMe = catchAsync(async (req, res) => {
  const user = req.user as User;

  const latestVerification = await prisma.purchaseVerification.findFirst({
    where: { userId: user.id },
    orderBy: { submittedAt: 'desc' }
  });

  const purchaseStatus = latestVerification?.status || PurchaseStatus.NOT_VERIFIED;

  const userDetails = await userService.getUserById(user.id);
  if (!userDetails) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  // Override purchase status with the latest record's status
  userDetails.purchaseStatus = purchaseStatus;

  const [userStats, totalRepsResult] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId: user.id } }),
    activityService.getUserIndividualReps(user.id)
  ]);

  const statsResponse = {
    totalPoints: userStats?.totalPoints || 0,
    totalChallenges: userStats?.totalChallenges || 0,
    topStreak: userStats?.topStreak || 0,
    currentStreak: userStats?.currentStreak || 0,
    region: userDetails.country || null,
    totalReps: totalRepsResult,
    totalCalori: (userStats?.totalPoints || 0) * 0.3
  };

  res.send({
    profile: exclude(userDetails, ['password']),
    stats: statsResponse
  });
});

const getProfilePictureUrl = catchAsync(async (req: Request, res) => {
  const user = req.user as User;
  const me = await userService.getUserById(user.id, ['profilePictureUrl']);
  if (!me?.profilePictureUrl) return res.send({ url: null });

  const key = me.profilePictureUrl.replace(`s3://${config.aws.s3.bucketName}/`, '');
  const url = await s3Service.getPresignedUrl(key, 600);
  res.send({ url });
});

const updateMe = catchAsync(async (req: Request, res) => {
  const user = req.user as User;
  const updateBody = pick(req.body, ['username']);

  if (Object.keys(updateBody).length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please provide content to update.');
  }

  const updatedUser = await userService.updateUserById(user.id, updateBody);
  res.send({
    message: 'Profile updated successfully.',
    user: updatedUser
  });
});

const updateProfilePicture = catchAsync(async (req: Request, res) => {
  const user = req.user as User;
  const file = req.file;
  if (!file) throw new ApiError(httpStatus.BAD_REQUEST, 'Profile picture file is required.');

  // 1) Validasi signature + re-encode
  const { bufferBersih, mimeFinal, extFinal } = await sanitizeImageOrThrow(file.buffer);

  // 2) Hapus foto lama (jika sebelumnya Anda simpan sebagai URL publik, tetap boleh pakai penghapus yang ada)
  const currentUser = await userService.getUserById(user.id, ['profilePictureUrl']);
  if (currentUser?.profilePictureUrl) {
    await s3Service.deleteByUrl(currentUser.profilePictureUrl);
  }

  // 3) Upload PRIVATE dengan nama acak
  const { key } = await s3Service.uploadPrivateFile(
    bufferBersih,
    extFinal,
    mimeFinal,
    'profile-pictures'
  );

  // 4) Simpan KEY (bukan URL publik) di DB
  const s3KeyUrl = `s3://${config.aws.s3.bucketName}/${key}`;
  const updatedUser = await userService.updateUserById(user.id, { profilePictureUrl: s3KeyUrl });

  // 5) Beri presigned URL untuk penggunaan segera di frontend
  const presignedUrl = await s3Service.getPresignedUrl(key);

  res.send({
    message: 'Profile picture updated successfully.',
    profilePictureUrl: presignedUrl
  });
});

const deleteProfilePicture = catchAsync(async (req: Request, res) => {
  const user = req.user as User;

  const currentUser = await userService.getUserById(user.id, ['profilePictureUrl']);

  if (currentUser?.profilePictureUrl) {
    await s3Service.deleteByUrl(currentUser.profilePictureUrl);
    await userService.updateUserById(user.id, { profilePictureUrl: null });
  }

  res.status(httpStatus.OK).send({ message: 'Profile picture deleted successfully.' });
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(parseInt(req.params.userId));
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(user);
});
const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(parseInt(req.params.userId), req.body);
  res.send(user);
});
const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(parseInt(req.params.userId));
  res.status(httpStatus.OK).send({ message: 'User deleted successfully.' });
});

const uploadPurchaseVerification = catchAsync(async (req: Request, res) => {
  const user = req.user as User;
  const file = req.file;
  const { type } = req.body;

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Receipt image is required');
  }

  const existingPending = await prisma.purchaseVerification.findFirst({
    where: { userId: user.id, status: PurchaseStatus.PENDING }
  });
  if (existingPending) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'You already have a purchase verification pending review.'
    );
  }

  // 1) Validasi magic-bytes + re-encode untuk sanitasi
  const { bufferBersih, mimeFinal, extFinal } = await sanitizeImageOrThrow(file.buffer);

  // 2) Upload PRIVATE ke S3 dengan nama acak (tanpa pakai originalname)
  const { key } = await s3Service.uploadPrivateFile(bufferBersih, extFinal, mimeFinal, 'receipts');

  // 3) Simpan IDENTIFIER/KEY, bukan URL publik permanen
  //    (Jika schema Anda pakai 'receiptImageUrl', kita isi dengan format s3:// agar tidak bisa diakses publik)
  const s3UrlLike = `s3://${config.aws.s3.bucketName}/${key}`;

  // 4) Transaksi DB: buat record verifikasi + set status user -> PENDING
  await prisma.$transaction(async (tx) => {
    await tx.purchaseVerification.create({
      data: {
        userId: user.id,
        receiptImageUrl: s3UrlLike,
        status: PurchaseStatus.PENDING,
        type
      }
    });

    await tx.user.update({
      where: { id: user.id },
      data: { purchaseStatus: PurchaseStatus.PENDING }
    });
  });

  res.status(httpStatus.ACCEPTED).send({
    message: 'Receipt uploaded successfully. Awaiting verification.',
    status: PurchaseStatus.PENDING
  });
});

const getPurchaseVerificationStatus = catchAsync(async (req, res) => {
  const user = req.user as User;

  const latestVerification = await prisma.purchaseVerification.findFirst({
    where: { userId: user.id },
    orderBy: { submittedAt: 'desc' }
  });

  const status = latestVerification?.status || PurchaseStatus.NOT_VERIFIED;

  res.status(httpStatus.OK).send({
    status,
    submittedAt: latestVerification?.submittedAt || null,
    reviewedAt: latestVerification?.reviewedAt || null,
    reason: latestVerification?.rejectionReason || null
  });
});

export default {
  createUser,
  getUsers,
  getMe,
  getProfilePictureUrl,
  updateMe,
  updateProfilePicture,
  deleteProfilePicture,
  getUser,
  updateUser,
  deleteUser,
  uploadPurchaseVerification,
  getPurchaseVerificationStatus
};
