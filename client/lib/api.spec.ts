import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiGet, parseApiError } from "./api";

describe("apiGet", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always uses method GET and credentials include", async () => {
    await apiGet("/api/foo");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/foo", {
      method: "GET",
      credentials: "include",
    });
  });

  it("ignores body and method from init to avoid accidental GET with body", async () => {
    await apiGet("/api/foo", {
      method: "POST",
      body: JSON.stringify({ x: 1 }),
    });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/foo");
    expect(call[1]).toMatchObject({ method: "GET", credentials: "include" });
    expect(call[1].body).toBeUndefined();
  });

  it("passes through other init options (e.g. headers, signal)", async () => {
    const ac = new AbortController();
    await apiGet("/api/foo", {
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/foo",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: ac.signal,
      }),
    );
  });
});

describe("parseApiError", () => {
  it("returns JSON .error when present", async () => {
    const res = new Response(JSON.stringify({ error: "Invalid input" }), {
      status: 400,
    });
    expect(await parseApiError(res)).toBe("Invalid input");
  });

  it("returns JSON .message when .error is absent", async () => {
    const res = new Response(JSON.stringify({ message: "Not found" }), {
      status: 404,
    });
    expect(await parseApiError(res)).toBe("Not found");
  });

  it("prefers .error over .message when both present", async () => {
    const res = new Response(JSON.stringify({ error: "Err", message: "Msg" }), {
      status: 500,
    });
    expect(await parseApiError(res)).toBe("Err");
  });

  it("returns body text when response is not JSON", async () => {
    const res = new Response("Plain error text", { status: 500 });
    expect(await parseApiError(res)).toBe("Plain error text");
  });

  it("returns fallback when body is empty and statusText empty", async () => {
    const res = new Response("", { status: 500, statusText: "" });
    expect(await parseApiError(res)).toBe("Request failed");
  });

  it("trims whitespace from message", async () => {
    const res = new Response(JSON.stringify({ error: "  trimmed  " }), {
      status: 400,
    });
    expect(await parseApiError(res)).toBe("trimmed");
  });
});
