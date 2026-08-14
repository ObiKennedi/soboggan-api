require('dotenv').config();
const { PrismaClient, Role, KycStatus } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_EMoTrgtDV5Y8@ep-jolly-lake-ayt7dt8h.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=30'
    }
  }
});

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
    const lowerEmail = adminData.email.toLowerCase();

    // Check if user exists by case-insensitive lookup
    const existing = await prisma.user.findFirst({
      where: {
        email: {
          equals: lowerEmail,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: lowerEmail,
          passwordHash,
          role: Role.ADMIN,
          kycStatus: KycStatus.VERIFIED,
          emailVerified: true,
          isActive: true,
          firstName: adminData.firstName,
          lastName: adminData.lastName,
          phone: adminData.phone,
        },
      });
      console.log(`✅ Admin account updated: ${updated.email} (ID: ${updated.id})`);
    } else {
      const created = await prisma.user.create({
        data: {
          email: lowerEmail,
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
      console.log(`✅ Admin account created: ${created.email} (ID: ${created.id})`);
    }
  }

  console.log('🎉 Seeding complete! All admin accounts are active with password "AdminPassword123!".');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding admin accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
