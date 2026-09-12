import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { GET, POST } from "../app/api/[action]/route";
import { createSession } from "../lib/server";

const origin = "http://127.0.0.1:3001";
const context = (action: string) => ({ params: Promise.resolve({ action }) });
function request(action: string, body: unknown) {
  return new Request(`${origin}/api/${action}`, {
    method: "POST",
    headers: {
      origin,
      cookie: `memory_session=${createSession()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function photo() {
  const buffer = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#507340" },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider routes", () => {
  it("returns only capability flags, never provider secrets", async () => {
    vi.stubEnv("REACTOR_API_KEY", "private-test-reactor-key");
    const response = await GET(
      new Request(`${origin}/api/capabilities`),
      context("capabilities"),
    );
    expect(await response.json()).toMatchObject({
      reactor: true,
      unlocked: false,
    });
  });
  it("rejects malformed image bytes before invoking a provider", async () => {
    vi.stubEnv("MEMORY_ACCESS_CODE", "private-access-for-tests");
    vi.stubEnv("RUNWARE_API_KEY", "test");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request("enhance", {
        consent: true,
        images: ["data:image/jpeg;base64,YWJj"],
        prompt: "A mountain path",
      }),
      context("enhance"),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("calls Reactor on Vercel without a database dependency", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MEMORY_SITE_ORIGIN", origin);
    vi.stubEnv("MEMORY_ACCESS_CODE", "private-access-for-tests");
    vi.stubEnv("REACTOR_API_KEY", "test");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ jwt: "test-token", expires_at: 1900000000 }),
      );
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request("token", { consent: true }),
      context("token"),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://api.reactor.inc/tokens");
  });
  it("mints a model-scoped token with one bounded session", async () => {
    vi.stubEnv("MEMORY_ACCESS_CODE", "private-access-for-tests");
    vi.stubEnv("REACTOR_API_KEY", "test");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ jwt: "session-scoped-token", expires_at: 1900000000 }),
      );
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request("token", { consent: true }),
      context("token"),
    );
    expect(response.status).toBe(200);
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.authorization_details).toEqual([
      {
        type: "session",
        resources: { models: { match: ["reactor/lingbot-world-2"] } },
        constraints: { max_sessions: 1, max_session_duration_seconds: 180 },
      },
    ]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("sends validated photos through protected Modal and rejects malformed depth responses", async () => {
    vi.stubEnv("MEMORY_ACCESS_CODE", "private-access-for-tests");
    vi.stubEnv("MODAL_DEPTH_URL", "https://memory-test.modal.run");
    vi.stubEnv("MODAL_TOKEN_ID", "proxy-id");
    vi.stubEnv("MODAL_TOKEN_SECRET", "proxy-secret");
    const image = await photo();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        depth: image,
        model: "depth-model",
        width: 64,
        height: 48,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request("depth", { consent: true, image }),
      context("depth"),
    );
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      "Modal-Key": "proxy-id",
      "Modal-Secret": "proxy-secret",
    });
    fetch.mockResolvedValue(
      Response.json({ depth: "https://arbitrary.example/track" }),
    );
    const bad = await POST(
      request("depth", { consent: true, image }),
      context("depth"),
    );
    expect(bad.status).toBe(502);
  });
  it("uses Runware reference inputs, matches task IDs, and returns an independent image", async () => {
    vi.stubEnv("MEMORY_ACCESS_CODE", "private-access-for-tests");
    vi.stubEnv("RUNWARE_API_KEY", "test");
    const image = await photo();
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      const [task] = JSON.parse(String(options.body));
      expect(task.model).toBe("bfl:5@1");
      expect(task.inputs.referenceImages).toHaveLength(2);
      expect(task.safety.checkContent).toBe(true);
      expect(task.outputType).toBe("dataURI");
      return Response.json({
        data: [{ taskUUID: task.taskUUID, imageDataURI: image, cost: 0.01 }],
      });
    });
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      request("enhance", {
        consent: true,
        images: [image, image],
        prompt: "Preserve the first reference photograph.",
      }),
      context("enhance"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      cost: 0.01,
      image: expect.stringContaining("data:image/jpeg;base64,"),
    });
  });
});
