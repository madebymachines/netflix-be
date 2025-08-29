import { AdminRole } from '@prisma/client';

const allRoles = {
  [AdminRole.ADMIN]: ['getUsers'],
  [AdminRole.SUPER_ADMIN]: ['getUsers', 'manageUsers']
};

export const roles = Object.keys(allRoles);
export const roleRights = new Map(Object.entries(allRoles));
