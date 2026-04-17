const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetPassword() {
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = await prisma.user.update({
      where: { email: 'admin@agroflow.io' },
      data: { password: hashedPassword }
    });
    
    console.log('✅ Admin password reset successfully!');
    console.log('Email:', admin.email);
    console.log('New Password: admin123');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();