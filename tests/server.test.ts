import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  isUnlocked,
  requireCloudAccess,
  requireOrigin,
  readJson,
  ApiError,
  takeBudget,
  json,
} from "../lib/server";

const origin = "http://localhost:3001";
const request = (headers: Record<string, string> = {}) =>
  new Request(`${origin}/api/token`, {
    method: "POST",
    headers: { origin, ...headers },
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Vercel cloud limits", () => {
  it("accepts the platform's exact deployment origin without extra setup", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "memory.example");
    vi.stubEnv("MEMORY_SITE_ORIGIN", "");
    expect(() =>
      requireOrigin(request({ origin: "https://memory.example" })),
    ).not.toThrow();
    expect(() =>
      requireOrigin(request({ origin: "https://untrusted.example" })),
    ).toThrow("Open Memory");
  });
  it("uses bounded in-memory counters on Vercel without a database request", () => {
    vi.stubEnv("VERCEL", "1");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const action = crypto.randomUUID();
    takeBudget(action, 1);
    expect(() => takeBudget(action, 1)).toThrow("request limit");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not send oversized provider responses through the hosting platform", () => {
    expect(() => json({ image: "a".repeat(4_000_000) })).toThrow("too large");
    expect(json({ ok: true }).status).toBe(200);
  });
});

describe("cloud security boundary", () => {
  it("denies spending without configured access and rejects cross-origin requests", () => {
    vi.stubEnv("MEMORY_ACCESS_CODE", "");
    expect(() => requireCloudAccess(request())).toThrow(ApiError);
    vi.stubEnv("MEMORY_ACCESS_CODE", "a-private-access-code");
    expect(() =>
      requireCloudAccess(request({ origin: "https://elsewhere.example" })),
    ).toThrow("Open Memory");
  });
  it("accepts only an unexpired, signed HttpOnly session", () => {
    vi.stubEnv("MEMORY_ACCESS_CODE", "a-private-access-code");
    const token = createSession();
    expect(isUnlocked(request({ cookie: `memory_session=${token}` }))).toBe(
      true,
    );
    expect(isUnlocked(request({ cookie: `memory_session=${token}x` }))).toBe(
      false,
    );
    expect(isUnlocked(request({ cookie: `memory_session=1.fake` }))).toBe(
      false,
    );
    expect(() =>
      requireCloudAccess(request({ cookie: `memory_session=${token}` })),
    ).not.toThrow();
  });
  it("uses the actual loopback host when Next normalizes the internal URL", () => {
    const sameOrigin = request({
      host: "127.0.0.1:3001",
      origin: "http://127.0.0.1:3001",
    });
    expect(() => requireOrigin(sameOrigin)).not.toThrow();
    expect(() =>
      requireOrigin(
        request({
          host: "127.0.0.1:3001",
          origin: "https://elsewhere.example",
        }),
      ),
    ).toThrow("Open Memory");
    vi.stubEnv("MEMORY_SITE_ORIGIN", "https://memory.example");
    expect(() => requireOrigin(sameOrigin)).not.toThrow();
    expect(() =>
      requireOrigin(request({ origin: "https://memory.example" })),
    ).not.toThrow();
    expect(() =>
      requireOrigin(request({ origin: "https://other.example" })),
    ).toThrow("Open Memory");
  });
  it("bounds streamed bodies even when content-length is absent", async () => {
    const req = new Request(`${origin}/api/depth`, {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(100) }),
    });
    await expect(readJson(req, 20)).rejects.toThrow("too large");
  });
});
