import { PrismaClient, Role, KycStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_ACCOUNTS = [
  {
    email: 'johndoe.admin@soboggan.com',
    firstName: 'John',
    lastName: 'Doe',
    password: 'AdminPassword123!',
    phone: '+2348000000001',
  },
  {
    email: 'sarahconnor.admin@soboggan.com',
    firstName: 'Sarah',
    lastName: 'Connor',
    password: 'AdminPassword123!',
    phone: '+2348000000002',
  },
  {
    email: 'alexsmith.admin@soboggan.com',
    firstName: 'Alex',
    lastName: 'Smith',
    password: 'AdminPassword123!',
    phone: '+2348000000003',
  },
  {
    email: 'admin.admin@soboggan.com',
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
    const email = adminData.email.toLowerCase();

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: Role.ADMIN,
        kycStatus: KycStatus.VERIFIED,
        emailVerified: true,
        isActive: true,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
      },
      create: {
        email,
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

    console.log(`✅ Admin account seeded: ${user.email} (ID: ${user.id})`);
  }

  console.log('🎉 Seeding complete! All admin accounts are active.');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding admin accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

