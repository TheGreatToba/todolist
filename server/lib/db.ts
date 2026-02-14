// Use default import for ESM compatibility with Vite/Vitest
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

let prisma: InstanceType<typeof PrismaClient>;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient();
  }
  prisma = (global as any).prisma;
}

export default prisma;
