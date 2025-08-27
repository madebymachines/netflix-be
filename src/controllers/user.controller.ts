import httpStatus from 'http-status';
import pick from '../utils/pick';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { userService, s3Service } from '../services'; // Impor s3Service
import { User, PurchaseStatus } from '@prisma/client';
import exclude from '../utils/exclude';
import prisma from '../client';
import { Request } from 'express';

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

const updateMe = catchAsync(async (req: Request, res) => {
  const user = req.user as User;
  const updateBody = req.body;
  const file = req.file;

  if (Object.keys(updateBody).length === 0 && !file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Harap berikan konten untuk diperbarui.');
  }

  if (file) {
    // Dapatkan data pengguna saat ini untuk menemukan URL gambar profil lama
    const currentUser = await userService.getUserById(user.id, ['profilePictureUrl']);

    // Hapus gambar profil lama dari S3 jika ada
    if (currentUser?.profilePictureUrl) {
      await s3Service.deleteFileByUrl(currentUser.profilePictureUrl);
    }

    // Unggah gambar profil baru ke S3
    const newProfilePictureUrl = await s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      'profile-pictures' // Nama folder
    );

    // Tambahkan URL baru ke updateBody
    updateBody.profilePictureUrl = newProfilePictureUrl;
  }

  const updatedUser = await userService.updateUserById(user.id, updateBody);
  res.send({
    message: 'Profil berhasil diperbarui.',
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

const uploadPurchaseVerification = catchAsync(async (req: Request, res) => {
  const user = req.user as User;
  const file = req.file;

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Gambar struk diperlukan');
  }

  // Unggah gambar struk baru ke S3
  const newReceiptImageUrl = await s3Service.uploadFile(
    file.buffer,
    file.originalname,
    file.mimetype,
    'receipts' // Nama folder
  );

  await prisma.$transaction(async (tx) => {
    // Temukan verifikasi PENDING atau REJECTED sebelumnya untuk pengguna
    const oldVerifications = await tx.purchaseVerification.findMany({
      where: {
        userId: user.id,
        status: {
          in: [PurchaseStatus.PENDING, PurchaseStatus.REJECTED]
        }
      }
    });

    // Hapus gambar struk lama dari S3
    for (const verification of oldVerifications) {
      await s3Service.deleteFileByUrl(verification.receiptImageUrl);
    }

    // Hapus catatan verifikasi lama dari DB
    if (oldVerifications.length > 0) {
      await tx.purchaseVerification.deleteMany({
        where: {
          id: {
            in: oldVerifications.map((v) => v.id)
          }
        }
      });
    }

    // Buat permintaan verifikasi baru
    await tx.purchaseVerification.create({
      data: {
        userId: user.id,
        receiptImageUrl: newReceiptImageUrl,
        status: PurchaseStatus.PENDING
      }
    });

    // Perbarui status pembelian utama pengguna
    await tx.user.update({
      where: { id: user.id },
      data: { purchaseStatus: PurchaseStatus.PENDING }
    });
  });

  res.status(httpStatus.ACCEPTED).send({
    message: 'Struk berhasil diunggah. Menunggu verifikasi.',
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
