declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /** Set by requireAuth middleware */
      auth?: { userId: string; email: string; role: "MANAGER" | "EMPLOYEE" };
      /** Set by requireTenantContext middleware */
      tenant?: {
        role: "MANAGER" | "EMPLOYEE";
        userId: string;
        teamIds: string[];
      };
    }
  }
}

export {};
