import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "../lib/client";

afterEach(() => vi.unstubAllGlobals());

it("rejects oversized UTF-8 payloads before sending any request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(api("enhance", z.unknown(), { prompt: "界".repeat(1_400_000) }))
    .rejects.toThrow("too large");
  expect(fetch).not.toHaveBeenCalled();
});

it.each([413, 504])("explains non-JSON hosting errors (%s) without leaking response bodies", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response("<html>internal hosting details</html>", { status }),
  ));
  await expect(api("enhance", z.unknown(), {})).rejects.toThrow(
    status === 413 ? "too large" : "timed out",
  );
});

it("keeps provider errors actionable and rejects malformed successful responses", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({
    error: { code: "LOCKED", message: "Unlock cloud access in Connections." },
  }, { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  await expect(api("token", z.object({ jwt: z.string() }), {})).rejects.toThrow("Unlock cloud access");
  fetch.mockResolvedValue(new Response("not JSON"));
  await expect(api("token", z.object({ jwt: z.string() }), {})).rejects.toThrow("unexpected response");
});
