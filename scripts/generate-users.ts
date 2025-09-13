import { PrismaClient, Gender, PurchaseStatus } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import logger from '../src/config/logger';

const prisma = new PrismaClient();

const hashPassword = (password: string) => {
  return bcrypt.hash(password, 8);
};

// Fungsi untuk membuat data pengguna palsu (disesuaikan untuk Faker v7)
const createRandomUser = (hashedPassword: string) => {
  const firstName = faker.name.firstName();
  const lastName = faker.name.lastName();
  const name = `${firstName} ${lastName}`;
  const email = faker.internet.email(firstName, lastName).toLowerCase();
  const username = faker.internet.userName(firstName, lastName);

  return {
    name,
    username,
    email,
    password: hashedPassword,
    phoneNumber: faker.phone.phoneNumber(),
    country: faker.helpers.arrayElement(['SG', 'TH', 'MY']),
    gender: faker.helpers.arrayElement<Gender>(['MALE', 'FEMALE']),
    purchaseStatus: faker.helpers.arrayElement<PurchaseStatus>([
      'NOT_VERIFIED',
      'PENDING',
      'APPROVED',
      'REJECTED'
    ]),
    emailVerifiedAt: new Date(), // Asumsikan semua pengguna sudah terverifikasi email
    isBanned: false
  };
};

async function main() {
  // 1. Dapatkan jumlah pengguna dari argumen command-line
  const userCountArg = process.argv[2];
  const userCount = userCountArg ? parseInt(userCountArg, 10) : 1000;

  if (isNaN(userCount) || userCount <= 0) {
    logger.error('Please provide a valid number of users to generate.');
    process.exit(1);
  }

  logger.info(`Starting to seed ${userCount} users...`);

  // 2. Hash password sekali saja untuk efisiensi
  const defaultPassword = 'password123';
  const hashedPassword = await hashPassword(defaultPassword);
  logger.info(`Using default password: "${defaultPassword}"`);

  const batchSize = 10000; // Ukuran batch untuk setiap operasi createMany
  const totalBatches = Math.ceil(userCount / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const currentBatchSize = Math.min(batchSize, userCount - i * batchSize);
    logger.info(`Generating batch ${i + 1}/${totalBatches} with ${currentBatchSize} users...`);

    // 3. Buat data pengguna untuk batch saat ini
    const usersData = [];
    // Menggunakan Set untuk memastikan email dan username unik dalam satu batch
    const uniqueEmails = new Set<string>();
    const uniqueUsernames = new Set<string>();

    for (let j = 0; j < currentBatchSize; j++) {
      let user;
      let attempts = 0;
      do {
        user = createRandomUser(hashedPassword);
        attempts++;
        // Jika terjadi duplikasi (sangat jarang), coba lagi hingga 5 kali
      } while (
        (uniqueEmails.has(user.email) || uniqueUsernames.has(user.username)) &&
        attempts < 5
      );

      if (attempts >= 5) {
        logger.warn(`Could not generate unique user after 5 attempts. Skipping one user.`);
        continue;
      }

      uniqueEmails.add(user.email);
      uniqueUsernames.add(user.username);
      usersData.push(user);
    }

    try {
      // 4. Masukkan pengguna baru ke database
      const createdUsersResult = await prisma.user.createMany({
        data: usersData,
        skipDuplicates: true // Lewati jika ada duplikasi email/username dengan data yang sudah ada di DB
      });

      logger.info(`Successfully created ${createdUsersResult.count} new users in batch ${i + 1}.`);

      // 5. Ambil pengguna yang baru dibuat untuk membuat UserStats
      const createdEmails = usersData.map((u) => u.email);
      const newUsers = await prisma.user.findMany({
        where: {
          email: {
            in: createdEmails
          }
        },
        select: {
          id: true
        }
      });

      // 6. Buat UserStats untuk setiap pengguna baru (disesuaikan untuk Faker v7)
      const statsData = newUsers.map((user) => ({
        userId: user.id,
        totalPoints: faker.datatype.number({ min: 0, max: 25000 }),
        totalChallenges: faker.datatype.number({ min: 0, max: 200 }),
        currentStreak: faker.datatype.number({ min: 0, max: 50 }),
        topStreak: faker.datatype.number({ min: 50, max: 150 })
      }));

      if (statsData.length > 0) {
        await prisma.userStats.createMany({
          data: statsData,
          skipDuplicates: true
        });
        logger.info(`Created UserStats for ${statsData.length} new users.`);
      }
    } catch (e: any) {
      logger.error(`Error processing batch ${i + 1}: ${e.message}`);
    }
  }

  logger.info('Seeding finished.');
}

main()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
