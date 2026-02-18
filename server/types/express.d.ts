declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /** Set by requireAuth middleware */
      auth?: { userId: string; email: string; role: "MANAGER" | "EMPLOYEE" };
    }
  }
}

export {};
