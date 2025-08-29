import { PrismaClient, AdminRole } from '@prisma/client'; // Impor AdminRole, bukan Role
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 8);
};

async function main() {
  console.log('Start seeding ...');

  const adminPassword = await hashPassword('password123');
  const superAdminPassword = await hashPassword('superpassword123');

  const admin = await prisma.admin.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@example.com',
      password: adminPassword,
      role: AdminRole.ADMIN
    }
  });

  const superAdmin = await prisma.admin.upsert({
    where: { email: 'superadmin@example.com' },
    update: {},
    create: {
      name: 'Super Admin User',
      email: 'superadmin@example.com',
      password: superAdminPassword,
      role: AdminRole.SUPER_ADMIN
    }
  });

  console.log({ admin, superAdmin });
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
