// Namespace import for ESM/CJS compat (Vitest, Vite, Node)
import * as PrismaPkg from '@prisma/client';
const PrismaClient = PrismaPkg.PrismaClient;

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
