require('dotenv').config();
const { PrismaClient, Role, KycStatus } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const ADMIN_ACCOUNTS = [
  {
    email: 'JohnDoe.admin@soboggan.com',
    firstName: 'John',
    lastName: 'Doe',
    password: 'AdminPassword123!',
    phone: '+2348000000001',
  },
  {
    email: 'SarahConnor.admin@soboggan.com',
    firstName: 'Sarah',
    lastName: 'Connor',
    password: 'AdminPassword123!',
    phone: '+2348000000002',
  },
  {
    email: 'AlexSmith.admin@soboggan.com',
    firstName: 'Alex',
    lastName: 'Smith',
    password: 'AdminPassword123!',
    phone: '+2348000000003',
  },
  {
    email: 'Admin.admin@soboggan.com',
    firstName: 'Soboggan',
    lastName: 'Admin',
    password: 'AdminPassword123!',
    phone: '+2348000000004',
  },
];

async function main() {
  console.log('🌱 Starting Admin Accounts Seeding…');

  for (const adminData of ADMIN_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(adminData.password, 10);

    const user = await prisma.user.upsert({
      where: { email: adminData.email },
      update: {
        role: Role.ADMIN,
        kycStatus: KycStatus.VERIFIED,
        emailVerified: true,
        isActive: true,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
      },
      create: {
        email: adminData.email,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        passwordHash,
        role: Role.ADMIN,
        kycStatus: KycStatus.VERIFIED,
        emailVerified: true,
        isActive: true,
        phone: adminData.phone,
      },
    });

    console.log(`✅ Admin account active: ${user.email} (Role: ${user.role}, ID: ${user.id})`);
  }

  console.log('🎉 Seeding complete! All admin accounts are ready.');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding admin accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
