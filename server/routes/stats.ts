import { RequestHandler } from "express";
import { getAuthOrThrow } from "../middleware/requireAuth";
import { getTenantOrThrow } from "../middleware/requireTenantContext";
import { sendErrorResponse } from "../lib/errors";
import { scopedPrisma } from "../security/scoped-prisma";

export const handleGetStats: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const db = scopedPrisma(tenant);

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const completedToday = await db.dailyTask.count({
      where: {
        status: "DONE",
        completedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    res.json({ success: true, data: { completedToday } });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};
