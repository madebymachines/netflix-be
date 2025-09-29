import httpStatus from 'http-status';
import pick from '../utils/pick';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { userService, s3Service, activityService } from '../services';
import { User, PurchaseStatus } from '@prisma/client';
import exclude from '../utils/exclude';
import prisma from '../client';
import { Request } from 'express';

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

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Profile picture file is required.');
  }

  const currentUser = await userService.getUserById(user.id, ['profilePictureUrl']);

  if (currentUser?.profilePictureUrl) {
    await s3Service.deleteFileByUrl(currentUser.profilePictureUrl);
  }

  const newProfilePictureUrl = await s3Service.uploadFile(
    file.buffer,
    file.originalname,
    file.mimetype,
    'profile-pictures'
  );

  const updatedUser = await userService.updateUserById(user.id, {
    profilePictureUrl: newProfilePictureUrl
  });

  res.send({
    message: 'Profile picture updated successfully.',
    profilePictureUrl: updatedUser?.profilePictureUrl
  });
});

const deleteProfilePicture = catchAsync(async (req: Request, res) => {
  const user = req.user as User;

  const currentUser = await userService.getUserById(user.id, ['profilePictureUrl']);

  if (currentUser?.profilePictureUrl) {
    await s3Service.deleteFileByUrl(currentUser.profilePictureUrl);
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
    where: {
      userId: user.id,
      status: PurchaseStatus.PENDING
    }
  });

  if (existingPending) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'You already have a purchase verification pending review.'
    );
  }

  const newReceiptImageUrl = await s3Service.uploadFile(
    file.buffer,
    file.originalname,
    file.mimetype,
    'receipts'
  );

  await prisma.$transaction(async (tx) => {
    await tx.purchaseVerification.create({
      data: {
        userId: user.id,
        receiptImageUrl: newReceiptImageUrl,
        status: PurchaseStatus.PENDING,
        type: type
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
  updateMe,
  updateProfilePicture,
  deleteProfilePicture,
  getUser,
  updateUser,
  deleteUser,
  uploadPurchaseVerification,
  getPurchaseVerificationStatus
};
