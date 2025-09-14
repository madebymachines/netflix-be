import { PrismaClient, Gender, PurchaseStatus, PurchaseType } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const hashPassword = (password: string) => {
  return bcrypt.hash(password, 8);
};

async function main() {
  console.log('--- Starting dummy data generation for thousands of records ---');

  // Hapus data lama untuk menghindari duplikasi, kecuali Admin
  console.log('Cleaning old data...');
  await prisma.activityHistory.deleteMany({});
  await prisma.purchaseVerification.deleteMany({});
  await prisma.userStats.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('Old data cleaned.');

  // === GENERATE USERS ===
  console.log('Generating users...');
  const userCount = 1000; // Jumlah pengguna ditingkatkan menjadi 1000
  const usersToCreate = [];
  const hashedPassword = await hashPassword('password123');
  const countries: ('SG' | 'TH' | 'MY')[] = ['SG', 'TH', 'MY'];
  const genders: Gender[] = ['MALE', 'FEMALE'];
  const purchaseStatuses: PurchaseStatus[] = ['NOT_VERIFIED', 'PENDING', 'APPROVED', 'REJECTED'];

  for (let i = 0; i < userCount; i++) {
    const firstName = faker.name.firstName();
    const lastName = faker.name.lastName();
    const name = `${firstName} ${lastName}`;
    const purchaseStatus = faker.helpers.arrayElement(purchaseStatuses);
    usersToCreate.push({
      name,
      username: faker.internet.userName(firstName, lastName) + `_${i}`, // Tambahkan suffix untuk keunikan
      email: faker.internet.email(firstName, lastName, `example${i}.com`), // Domain unik untuk email
      password: hashedPassword,
      phoneNumber: faker.phone.number(),
      profilePictureUrl: faker.image.avatar(),
      country: faker.helpers.arrayElement(countries),
      gender: faker.helpers.arrayElement(genders),
      purchaseStatus,
      emailVerifiedAt: Math.random() < 0.8 ? faker.date.past() : null, // 80% email terverifikasi
      isBanned: Math.random() < 0.1, // 10% user dibanned
      banReason: Math.random() < 0.1 ? 'Violation of terms.' : null
    });
  }
  await prisma.user.createMany({ data: usersToCreate });
  const createdUsers = await prisma.user.findMany();
  console.log(`${createdUsers.length} users generated.`);

  // === GENERATE ACTIVITIES AND STATS FOR EACH USER ===
  console.log('Generating activities and stats for each user...');
  for (const user of createdUsers) {
    let totalPoints = 0;
    let totalChallenges = 0;
    const activitiesToCreate = [];
    const activityCount = faker.datatype.number({ min: 10, max: 100 }); // Jumlah aktivitas per pengguna

    for (let i = 0; i < activityCount; i++) {
      const eventType = faker.helpers.arrayElement(['INDIVIDUAL', 'GROUP']);
      let pointsEarn = faker.datatype.number({ min: 10, max: 120 });
      let status: PurchaseStatus = PurchaseStatus.PENDING;
      let isFlagged = false;
      const flagReasons: string[] = [];

      if (eventType === 'INDIVIDUAL') {
        status = PurchaseStatus.APPROVED;
      } else {
        status = faker.helpers.arrayElement(['PENDING', 'APPROVED', 'REJECTED']);
      }

      // Simulasi Flagging (15% kemungkinan)
      if (Math.random() < 0.15) {
        isFlagged = true;
        const reasonType = faker.datatype.number({ min: 1, max: 4 });
        if (reasonType === 1) {
          pointsEarn = faker.datatype.number({ min: 151, max: 200 });
          flagReasons.push(`Extreme points submitted: requested ${pointsEarn}, capped at 150.`);
        }
        if (reasonType === 2) {
          flagReasons.push(
            `Drastic daily increase: today's ${faker.datatype.number({
              min: 500,
              max: 1000
            })} vs avg 50.`
          );
        }
        if (reasonType === 3 && i >= 9) {
          // Hanya jika sudah ada cukup data
          flagReasons.push(`Perfect consistency: last 10 submissions had ${pointsEarn} points.`);
        }
        if (reasonType === 4) {
          flagReasons.push(
            `Rapid submission: new activity submitted ${faker.datatype.number({
              min: 1,
              max: 59
            })}s after the previous one.`
          );
        }
      }

      if (status !== 'REJECTED') {
        activitiesToCreate.push({
          userId: user.id,
          eventType,
          pointsEarn,
          pointsFrom: totalPoints,
          pointsTo: totalPoints + pointsEarn,
          submissionImageUrl: faker.image.imageUrl(640, 480, 'sports', true),
          status,
          createdAt: faker.date.recent(90), // Sebar data dalam 90 hari terakhir
          isFlagged,
          flagReason: flagReasons.join(' | ') || null
        });
        totalPoints += pointsEarn;
        totalChallenges++;
      }
    }

    if (activitiesToCreate.length > 0) {
      await prisma.activityHistory.createMany({
        data: activitiesToCreate
      });
    }

    const currentStreak = faker.datatype.number({ min: 0, max: 50 });
    await prisma.userStats.create({
      data: {
        userId: user.id,
        totalPoints,
        totalChallenges,
        currentStreak,
        topStreak: faker.datatype.number({ min: currentStreak, max: 150 })
      }
    });
  }
  console.log('Activities and stats generated.');

  // === GENERATE PURCHASE VERIFICATIONS ===
  console.log('Generating purchase verifications...');
  const verificationsToCreate = [];
  for (const user of createdUsers) {
    if (user.purchaseStatus !== 'NOT_VERIFIED') {
      verificationsToCreate.push({
        userId: user.id,
        receiptImageUrl: faker.image.imageUrl(640, 480, 'transport', true),
        status: user.purchaseStatus,
        type: faker.helpers.arrayElement<PurchaseType>(['RECEIPT', 'MEMBER_GYM']),
        submittedAt: faker.date.recent(30),
        reviewedAt: user.purchaseStatus !== 'PENDING' ? faker.date.recent(15) : null,
        rejectionReason: user.purchaseStatus === 'REJECTED' ? 'Image is blurry or invalid.' : null
      });
    }
  }
  if (verificationsToCreate.length > 0) {
    await prisma.purchaseVerification.createMany({ data: verificationsToCreate });
  }
  console.log(`${verificationsToCreate.length} purchase verifications generated.`);

  console.log('--- Dummy data generation finished successfully ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
