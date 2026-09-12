import { z } from "zod";
import { ApiErrorSchema, MAX_CLOUD_BODY_BYTES } from "./contracts";

export async function api<T>(
  action: string,
  schema: z.ZodType<T>,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (
    payload &&
    new TextEncoder().encode(payload).byteLength > MAX_CLOUD_BODY_BYTES
  ) {
    throw new Error(
      "These reference photos are too large to upload together. Choose smaller photos.",
    );
  }
  let response: Response;
  try {
    response = await fetch(`/api/${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: payload,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(180_000)])
        : AbortSignal.timeout(180_000),
      cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "The connection was interrupted or timed out. Your photos are safe. Check your connection before trying again; a cloud job may already have used credits.",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      response.status === 413
        ? "The hosting service rejected the upload size. Choose smaller reference photos."
        : "The hosting service could not finish this request. Your saved photos are unchanged.",
    );
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(data);
    throw new Error(
      parsed.success
        ? parsed.data.error.message
        : "The service could not complete this request. Try again later.",
    );
  }
  const result = schema.safeParse(data);
  if (!result.success)
    throw new Error(
      "The service returned an unexpected response. Your photos have not been changed.",
    );
  return result.data;
}
