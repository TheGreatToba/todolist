import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProfile, fetchManagerDashboard } from "./queries";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api")>();
  return { ...mod, api: { get: vi.fn() } };
});

describe("fetchProfile", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("returns { user: null } on 401", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    const result = await fetchProfile();
    expect(result).toEqual({ user: null });
  });

  it("returns { user: null } on 403", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );
    const result = await fetchProfile();
    expect(result).toEqual({ user: null });
  });

  it("returns user payload on 200", async () => {
    const user = {
      id: "1",
      name: "Test",
      email: "a@b.com",
      role: "EMPLOYEE" as const,
    };
    vi.mocked(api.get).mockResolvedValue(
      new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchProfile();
    expect(result).toEqual({ user });
  });

  it("throws with parseApiError message on generic non-OK (e.g. 500 + JSON)", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchProfile()).rejects.toThrow("Internal server error");
  });

  it("throws with statusText when body is empty and statusText non-empty", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" }),
    );
    await expect(fetchProfile()).rejects.toThrow("Internal Server Error");
  });

  it("propagates network error when api.get is rejected", async () => {
    const networkError = new Error("Network error");
    vi.mocked(api.get).mockRejectedValue(networkError);
    await expect(fetchProfile()).rejects.toThrow("Network error");
  });
});

describe("fetchManagerDashboard", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("returns null on 404", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );
    const result = await fetchManagerDashboard({});
    expect(result).toBeNull();
  });

  it("returns dashboard payload on 200", async () => {
    const dashboard = { teams: [], date: "2025-01-01" };
    vi.mocked(api.get).mockResolvedValue(
      new Response(JSON.stringify(dashboard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchManagerDashboard({ date: "2025-01-01" });
    expect(result).toEqual(dashboard);
  });

  it("throws with parseApiError message on generic non-OK (e.g. 500 + plain text)", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response("Service temporarily unavailable", { status: 503 }),
    );
    await expect(fetchManagerDashboard({})).rejects.toThrow(
      "Service temporarily unavailable",
    );
  });

  it("throws with statusText when body is empty and statusText non-empty", async () => {
    vi.mocked(api.get).mockResolvedValue(
      new Response("", { status: 502, statusText: "Bad Gateway" }),
    );
    await expect(fetchManagerDashboard({})).rejects.toThrow("Bad Gateway");
  });

  it("propagates network error when api.get is rejected", async () => {
    const networkError = new Error("Network error");
    vi.mocked(api.get).mockRejectedValue(networkError);
    await expect(fetchManagerDashboard({})).rejects.toThrow("Network error");
  });
});
