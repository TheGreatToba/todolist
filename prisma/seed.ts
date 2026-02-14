import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create workstations
  const checkoutWorkstation = await prisma.workstation.create({
    data: { name: 'Checkout' },
  });

  const kitchenWorkstation = await prisma.workstation.create({
    data: { name: 'Kitchen' },
  });

  const receptionWorkstation = await prisma.workstation.create({
    data: { name: 'Reception' },
  });

  console.log('✅ Created workstations');

  // Create a manager
  const managerUser = await prisma.user.create({
    data: {
      name: 'Alice Manager',
      email: 'mgr@test.com',
      passwordHash: await bcryptjs.hash('password', 10),
      role: 'MANAGER',
    },
  });

  // Create team for manager
  const team = await prisma.team.create({
    data: {
      name: 'Daily Operations Team',
      managerId: managerUser.id,
    },
  });

  // Update manager with team ID
  await prisma.user.update({
    where: { id: managerUser.id },
    data: { teamId: team.id },
  });

  console.log('✅ Created team and manager');

  // Create employees
  const employee1 = await prisma.user.create({
    data: {
      name: 'Bob Employee',
      email: 'emp@test.com',
      passwordHash: await bcryptjs.hash('password', 10),
      role: 'EMPLOYEE',
      teamId: team.id,
      workstations: {
        create: [{ workstationId: checkoutWorkstation.id }],
      },
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      name: 'Carol Chef',
      email: 'carol@test.com',
      passwordHash: await bcryptjs.hash('password', 10),
      role: 'EMPLOYEE',
      teamId: team.id,
      workstations: {
        create: [{ workstationId: kitchenWorkstation.id }],
      },
    },
  });

  const employee3 = await prisma.user.create({
    data: {
      name: 'David Receptionist',
      email: 'david@test.com',
      passwordHash: await bcryptjs.hash('password', 10),
      role: 'EMPLOYEE',
      teamId: team.id,
      workstations: {
        create: [{ workstationId: receptionWorkstation.id }],
      },
    },
  });

  console.log('✅ Created employees');

  // Create task templates
  const taskTemplate1 = await prisma.taskTemplate.create({
    data: {
      title: 'Count Cash Register',
      description: 'Count and reconcile the cash register at the end of shift',
      workstationId: checkoutWorkstation.id,
      createdById: managerUser.id,
      isRecurring: true,
    },
  });

  const taskTemplate2 = await prisma.taskTemplate.create({
    data: {
      title: 'Clean Workstation',
      description: 'Clean and sanitize all surfaces',
      workstationId: checkoutWorkstation.id,
      createdById: managerUser.id,
      isRecurring: true,
    },
  });

  const taskTemplate3 = await prisma.taskTemplate.create({
    data: {
      title: 'Prep Ingredients',
      description: 'Prepare and measure all ingredients for the day',
      workstationId: kitchenWorkstation.id,
      createdById: managerUser.id,
      isRecurring: true,
    },
  });

  const taskTemplate4 = await prisma.taskTemplate.create({
    data: {
      title: 'Stock Shelves',
      description: 'Ensure all items are properly stocked and organized',
      workstationId: receptionWorkstation.id,
      createdById: managerUser.id,
      isRecurring: true,
    },
  });

  console.log('✅ Created task templates');

  // Create daily tasks for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyTask.create({
    data: {
      taskTemplateId: taskTemplate1.id,
      employeeId: employee1.id,
      date: today,
      isCompleted: true,
      completedAt: new Date(),
    },
  });

  await prisma.dailyTask.create({
    data: {
      taskTemplateId: taskTemplate2.id,
      employeeId: employee1.id,
      date: today,
      isCompleted: false,
    },
  });

  await prisma.dailyTask.create({
    data: {
      taskTemplateId: taskTemplate3.id,
      employeeId: employee2.id,
      date: today,
      isCompleted: true,
      completedAt: new Date(),
    },
  });

  await prisma.dailyTask.create({
    data: {
      taskTemplateId: taskTemplate4.id,
      employeeId: employee3.id,
      date: today,
      isCompleted: false,
    },
  });

  console.log('✅ Created daily tasks');

  console.log('✅ Seed completed successfully!');
  console.log('\n📝 Demo Credentials:');
  console.log('   Manager: mgr@test.com / password');
  console.log('   Employee: emp@test.com / password');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
