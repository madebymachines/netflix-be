import { PrismaClient, AdminRole, ReportStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 8);
};

// --- PERUBAHAN DIMULAI DI SINI ---
// Jadwal kampanye dengan penanda zona waktu UTC+8 (Malaysia/Singapore Time)
const campaignSchedule = [
  { week: 1, start: '2025-11-01T00:00:00+08:00', end: '2025-11-07T23:59:59+08:00' },
  { week: 2, start: '2025-11-08T00:00:00+08:00', end: '2025-11-14T23:59:59+08:00' },
  { week: 3, start: '2025-11-15T00:00:00+08:00', end: '2025-11-21T23:59:59+08:00' },
  { week: 4, start: '2025-11-22T00:00:00+08:00', end: '2025-11-28T23:59:59+08:00' },
  { week: 5, start: '2025-11-29T00:00:00+08:00', end: '2025-12-05T23:59:59+08:00' },
  { week: 6, start: '2025-12-06T00:00:00+08:00', end: '2025-12-12T23:59:59+08:00' },
  { week: 7, start: '2025-12-13T00:00:00+08:00', end: '2025-12-19T23:59:59+08:00' },
  { week: 8, start: '2025-12-20T00:00:00+08:00', end: '2025-12-26T23:59:59+08:00' },
  { week: 9, start: '2025-12-27T00:00:00+08:00', end: '2026-01-02T23:59:59+08:00' },
  { week: 10, start: '2026-01-03T00:00:00+08:00', end: '2026-01-09T23:59:59+08:00' },
  { week: 11, start: '2026-01-10T00:00:00+08:00', end: '2026-01-16T23:59:59+08:00' },
  { week: 12, start: '2026-01-17T00:00:00+08:00', end: '2026-01-23T23:59:59+08:00' },
  { week: 13, start: '2026-01-24T00:00:00+08:00', end: '2026-01-31T23:59:59+08:00' }
];
// --- PERUBAHAN SELESAI DI SINI ---

async function main() {
  console.log('Start seeding ...');

  // --- Seed Admins ---
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
  console.log('Admin users seeded:', { admin, superAdmin });

  // --- Seed System Settings ---
  await prisma.setting.upsert({
    where: { key: 'isRegistrationOpen' },
    update: {},
    create: {
      key: 'isRegistrationOpen',
      value: 'true' // 'true' or 'false' as a string
    }
  });

  await prisma.setting.upsert({
    where: { key: 'registrationLimit' },
    update: {},
    create: {
      key: 'registrationLimit',
      value: '0' // 0 means no limit
    }
  });
  console.log('Default settings seeded.');

  // --- Seed Weekly Winner Report Schedule ---
  console.log('Seeding weekly winner report schedule with correct timezone (UTC+8)...');
  for (const schedule of campaignSchedule) {
    await prisma.weeklyWinnerReport.upsert({
      where: { weekNumber: schedule.week },
      update: {
        periodStart: new Date(schedule.start),
        periodEnd: new Date(schedule.end)
      },
      create: {
        weekNumber: schedule.week,
        periodStart: new Date(schedule.start),
        periodEnd: new Date(schedule.end),
        status: ReportStatus.PENDING
      }
    });
  }
  console.log('Weekly report schedule seeded successfully.');

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
