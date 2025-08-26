import httpStatus from 'http-status';
import pick from '../utils/pick';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { userService } from '../services';
import { User, PurchaseStatus } from '@prisma/client';
import exclude from '../utils/exclude';
import prisma from '../client';

const createUser = catchAsync(async (req, res) => {
  const { email, password, name, username, phoneNumber, country } = req.body; // Diubah dari fullName
  const user = await userService.createUser({
    email,
    password,
    name, // Diubah dari fullName
    username,
    phoneNumber,
    country
  });
  res.status(httpStatus.CREATED).send(exclude(user, ['password']));
});
const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role']); // Diubah dari fullName
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});
const getMe = catchAsync(async (req, res) => {
  const user = req.user as User;
  const userDetails = await userService.getUserById(user.id);
  if (!userDetails) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  const userStats = await prisma.userStats.findUnique({ where: { userId: user.id } });

  // Update response Stats sesuai model baru
  const statsResponse = userStats
    ? {
        totalPoints: userStats.totalPoints,
        totalChallenges: userStats.totalChallenges,
        topStreak: userStats.topStreak,
        currentStreak: userStats.currentStreak
      }
    : null;

  res.send({
    profile: exclude(userDetails, ['password', 'role']),
    stats: statsResponse
  });
});
const updateMe = catchAsync(async (req, res) => {
  const user = req.user as User;
  const updatedUser = await userService.updateUserById(user.id, req.body);
  res.send({
    message: 'Profile updated successfully.',
    user: updatedUser
  });
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
  res.status(httpStatus.NO_CONTENT).send();
});
const uploadPurchaseVerification = catchAsync(async (req, res) => {
  const user = req.user as User;
  const receiptImageUrl = req.body.receiptImageUrl;

  if (!receiptImageUrl) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Receipt image URL is required');
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseVerification.create({
      data: {
        userId: user.id,
        receiptImageUrl: receiptImageUrl,
        status: PurchaseStatus.PENDING
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

  const currentUser = await userService.getUserById(user.id, ['purchaseStatus']);

  if (!currentUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  let latestVerification = null;
  if (currentUser.purchaseStatus === PurchaseStatus.REJECTED) {
    latestVerification = await prisma.purchaseVerification.findFirst({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' }
    });
  } else {
    latestVerification = await prisma.purchaseVerification.findFirst({
      where: { userId: user.id },
      orderBy: { submittedAt: 'desc' }
    });
  }

  res.status(httpStatus.OK).send({
    status: currentUser.purchaseStatus,
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
  getUser,
  updateUser,
  deleteUser,
  uploadPurchaseVerification,
  getPurchaseVerificationStatus
};
