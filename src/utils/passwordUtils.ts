// utils/passwordUtils.ts
import bcrypt from 'bcryptjs';
import prisma from '../client';

const PASSWORD_HISTORY_LIMIT = 5; // Number of previous passwords to check

/**
 * Check if password was previously used
 * @param userId - User ID
 * @param newPassword - New password to check
 * @returns Promise<boolean> - true if password was used before
 */
export const checkPasswordHistory = async (
  userId: number,
  newPassword: string
): Promise<boolean> => {
  const passwordHistory = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_LIMIT,
    select: { passwordHash: true }
  });

  // Check against all previous passwords
  for (const history of passwordHistory) {
    const isMatch = await bcrypt.compare(newPassword, history.passwordHash);
    if (isMatch) {
      return true; // Password was used before
    }
  }

  return false; // Password is new
};

/**
 * Save password to history
 * @param userId - User ID
 * @param passwordHash - Hashed password
 */
export const savePasswordToHistory = async (
  userId: number,
  passwordHash: string
): Promise<void> => {
  // Add new password to history
  await prisma.passwordHistory.create({
    data: {
      userId,
      passwordHash
    }
  });

  // Keep only the last N passwords
  const allHistory = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });

  if (allHistory.length > PASSWORD_HISTORY_LIMIT) {
    const idsToDelete = allHistory
      .slice(PASSWORD_HISTORY_LIMIT)
      .map(h => h.id);

    await prisma.passwordHistory.deleteMany({
      where: {
        id: { in: idsToDelete }
      }
    });
  }
};

/**
 * Invalidate all user tokens (for password reset security)
 * @param userId - User ID
 */
export const invalidateAllUserTokens = async (userId: number): Promise<void> => {
  await prisma.token.deleteMany({
    where: {
      userId,
      type: { in: ['ACCESS', 'REFRESH'] }
    }
  });
};