import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { ImageDataSchema, MAX_CLOUD_BODY_BYTES } from "./contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function accessConfigured(): boolean {
  return (process.env.MEMORY_ACCESS_CODE?.length ?? 0) >= 16;
}

function signature(value: string): string {
  return createHmac("sha256", process.env.MEMORY_ACCESS_CODE || "")
    .update(value)
    .digest("hex");
}

export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSession(): string {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expiry}.${signature(expiry)}`;
}

export function isUnlocked(req: Request): boolean {
  if (!accessConfigured()) return false;
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("memory_session="))
    ?.slice(15);
  if (!token) return false;
  const [expiry, hash, extra] = token.split(".");
  return (
    !extra &&
    !!hash &&
    /^\d+$/.test(expiry) &&
    Number(expiry) > Date.now() &&
    equalSecret(signature(expiry), hash)
  );
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostKey(host: string | null | undefined): string {
  if (!host) return "";
  try {
    const url = new URL(`memory://${host}`);
    const name = url.hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(name)
      ? `loopback:${url.port}`
      : `${name}:${url.port}`;
  } catch {
    return host.toLowerCase();
  }
}

export function requireOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  let originHost = "";
  if (origin) {
    try {
      originHost = new URL(origin).host;
    } catch {}
  }
  const trusted = new Set<string>([hostKey(req.headers.get("host"))]);
  try {
    if (process.env.MEMORY_SITE_ORIGIN)
      trusted.add(hostKey(new URL(process.env.MEMORY_SITE_ORIGIN).host));
  } catch {}
  if (process.env.VERCEL === "1")
    for (const host of [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ])
      trusted.add(hostKey(host));
  if (!originHost || !trusted.has(hostKey(originHost)))
    throw new ApiError(
      403,
      "ORIGIN",
      "Open Memory in its own browser tab and try again.",
    );
}

export function requireCloudAccess(req: Request): void {
  requireOrigin(req);
  if (!accessConfigured())
    throw new ApiError(
      503,
      "SETUP",
      "Cloud access needs a MEMORY_ACCESS_CODE of at least 16 characters on the server. Your local photo library still works.",
    );
  if (!isUnlocked(req))
    throw new ApiError(
      401,
      "LOCKED",
      "Unlock cloud access in Connections, then try again.",
    );
}

const budgets = new Map<string, { count: number; reset: number }>();
export function takeBudget(
  action: string,
  limit: number,
  windowMs = 3_600_000,
): void {
  let bucket = budgets.get(action);
  if (!bucket || Date.now() >= bucket.reset) {
    bucket = { count: 0, reset: Date.now() + windowMs };
    budgets.set(action, bucket);
  }
  if (bucket.count >= limit)
    throw new ApiError(
      429,
      "RATE_LIMIT",
      "The cloud request limit was reached. Wait before trying again.",
    );
  bucket.count++;
}

export async function readJson(
  req: Request | Response,
  maxBytes: number,
): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "BODY", "Send a valid request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          413,
          "SIZE",
          "This request is too large. Use smaller photos.",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(
      400,
      "JSON",
      "The request could not be read. Try again.",
    );
  }
}

export async function normalizeImage(value: string): Promise<string> {
  const parsed = ImageDataSchema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(400, "IMAGE", "Choose a valid JPG, PNG, or WebP photo.");
  try {
    const buffer = Buffer.from(value.split(",")[1], "base64");
    const image = sharp(buffer, {
      limitInputPixels: 16_000_000,
      animated: false,
    });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format || ""))
      throw new Error("format");
    const data = await image
      .rotate()
      .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" })
      .jpeg({ quality: 88 })
      .toBuffer();
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  } catch {
    throw new ApiError(
      400,
      "IMAGE",
      "This photo could not be decoded. Export it as a smaller JPG and try again.",
    );
  }
}

export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > MAX_CLOUD_BODY_BYTES)
    throw new ApiError(
      502,
      "SIZE",
      "The generated result is too large to deliver. Your source photos are unchanged; check the provider task before retrying.",
    );
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  const known =
    error instanceof ApiError
      ? error
      : new ApiError(
          502,
          "UPSTREAM",
          "The cloud service did not finish. Your photos are safe. Check Connections before trying again; the request may already have used credits.",
        );
  return json(
    { error: { code: known.code, message: known.message } },
    known.status,
  );
}
