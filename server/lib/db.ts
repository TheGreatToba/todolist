// Namespace import for ESM/CJS compat (Vitest, Vite, Node)
import * as PrismaPkg from "@prisma/client";
import { applyTaskTemplateInvariantMiddleware } from "./task-template-invariant";

const PrismaClient = PrismaPkg.PrismaClient;

let prisma: InstanceType<typeof PrismaClient>;

function createPrismaWithMiddleware(): InstanceType<typeof PrismaClient> {
  const client = new PrismaClient();
  applyTaskTemplateInvariantMiddleware(client);
  return client;
}

if (process.env.NODE_ENV === "production") {
  prisma = createPrismaWithMiddleware();
} else {
  if (!(global as any).prisma) {
    (global as any).prisma = createPrismaWithMiddleware();
  }
  prisma = (global as any).prisma;
}

export default prisma;
