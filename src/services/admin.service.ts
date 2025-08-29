import { Admin, Prisma, AdminRole } from '@prisma/client';
import httpStatus from 'http-status';
import prisma from '../client';
import ApiError from '../utils/ApiError';
import { encryptPassword } from '../utils/encryption';

/**
 * Get admin by email
 * @param {string} email
 * @returns {Promise<Admin | null>}
 */
export const getAdminByEmail = async (email: string): Promise<Admin | null> => {
  return prisma.admin.findUnique({
    where: { email }
  });
};

/**
 * Get admin by id
 * @param {number} id
 * @returns {Promise<Pick<Admin, 'id' | 'name' | 'email' | 'role'> | null>}
 */
export const getAdminById = async (
  id: number
): Promise<Pick<Admin, 'id' | 'name' | 'email' | 'role'> | null> => {
  return prisma.admin.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });
};

/**
 * Create an admin
 * @param {object} adminBody
 * @returns {Promise<Admin>}
 */
export const createAdmin = async (adminBody: {
  email: string;
  password: string;
  name: string;
  role: AdminRole;
}): Promise<Admin> => {
  if (await getAdminByEmail(adminBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken by an admin');
  }
  const hashedPassword = await encryptPassword(adminBody.password);
  return prisma.admin.create({
    data: {
      ...adminBody,
      password: hashedPassword
    }
  });
};

export default {
  getAdminByEmail,
  getAdminById,
  createAdmin
};
