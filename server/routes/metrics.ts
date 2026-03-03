import { RequestHandler } from "express";
import { z } from "zod";
import { getAuthOrThrow } from "../middleware/requireAuth";
import { getTenantOrThrow } from "../middleware/requireTenantContext";
import { sendErrorResponse } from "../lib/errors";
import { scopedPrisma } from "../security/scoped-prisma";
import { assertManagerOwnsTeam } from "../security/tenantGuard";

const TrackManagerKpiEventSchema = z.object({
  name: z.string().min(1).max(128),
  occurredAt: z.string().datetime().optional(),
  properties: z.record(z.any()).optional(),
});

export const handleTrackManagerKpiEvent: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    if (payload.role !== "MANAGER") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (tenant.teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    assertManagerOwnsTeam(tenant, tenant.teamIds[0]);

    const body = TrackManagerKpiEventSchema.parse(req.body ?? {});

    await prisma.managerKpiEvent.create({
      data: {
        managerId: payload.userId,
        name: body.name,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        properties: body.properties ?? undefined,
      },
    });

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};
