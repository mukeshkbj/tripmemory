import { z } from "zod";
import {
  DepthRequestSchema,
  DepthResponseSchema,
  EnhanceRequestSchema,
  JourneyRequestSchema,
  TokenResponseSchema,
  MAX_CLOUD_BODY_BYTES,
} from "@/lib/contracts";
import {
  accessConfigured,
  ApiError,
  createSession,
  equalSecret,
  errorResponse,
  isUnlocked,
  json,
  normalizeImage,
  readJson,
  requireCloudAccess,
  requireOrigin,
  takeBudget,
} from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ action: string }> };

export async function GET(req: Request, context: Context) {
  const { action } = await context.params;
  if (action !== "capabilities")
    return json(
      {
        error: { code: "NOT_FOUND", message: "This endpoint does not exist." },
      },
      404,
    );
  return json({
    reactor: !!process.env.REACTOR_API_KEY,
    runware: !!process.env.RUNWARE_API_KEY,
    modal: !!(
      process.env.MODAL_DEPTH_URL &&
      process.env.MODAL_TOKEN_ID &&
      process.env.MODAL_TOKEN_SECRET
    ),
    unlocked: isUnlocked(req),
    accessRequired: accessConfigured(),
  });
}

export async function POST(req: Request, context: Context) {
  try {
    const { action } = await context.params;
    requireOrigin(req);
    if (action === "unlock") {
      takeBudget("unlock", 10, 900_000);
      if (!accessConfigured())
        throw new ApiError(
          503,
          "SETUP",
          "Set MEMORY_ACCESS_CODE to at least 16 characters on the server first.",
        );
      const body = z
        .object({ code: z.string().max(200) })
        .safeParse(await readJson(req, 1024));
      if (
        !body.success ||
        !equalSecret(body.data.code, process.env.MEMORY_ACCESS_CODE || "")
      )
        throw new ApiError(
          401,
          "ACCESS",
          "That access code did not match. Try again.",
        );
      return json({ ok: true }, 200, {
        "Set-Cookie": `memory_session=${createSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.VERCEL === "1" || new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    if (action === "lock")
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "memory_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    requireCloudAccess(req);
    if (action === "token") {
      const consent = z
        .object({ consent: z.literal(true) })
        .safeParse(await readJson(req, 1024));
      if (!consent.success)
        throw new ApiError(
          400,
          "CONSENT",
          "Confirm that you want to start a paid Reactor session.",
        );
      if (!process.env.REACTOR_API_KEY)
        throw new ApiError(
          503,
          "SETUP",
          "Add REACTOR_API_KEY to the server environment, then restart the app.",
        );
      takeBudget("token", 6);
      const response = await fetch("https://api.reactor.inc/tokens", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Reactor-API-Key": process.env.REACTOR_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: 900,
          authorization_details: [
            {
              type: "session",
              resources: { models: { match: ["reactor/lingbot-world-2"] } },
              constraints: {
                max_sessions: 1,
                max_session_duration_seconds: 180,
              },
            },
          ],
        }),
      });
      if (!response.ok)
        throw new ApiError(
          502,
          "REACTOR",
          response.status === 402
            ? "Reactor has no available credits. Add credits before starting another walk."
            : "Reactor could not open a session. Check the server key, account access, and credits.",
        );
      return json(TokenResponseSchema.parse(await readJson(response, 20_000)));
    }
    if (action === "depth") {
      const body = DepthRequestSchema.safeParse(
        await readJson(req, MAX_CLOUD_BODY_BYTES),
      );
      if (!body.success)
        throw new ApiError(
          400,
          "INPUT",
          "Choose a valid photo and confirm cloud processing.",
        );
      const {
        MODAL_DEPTH_URL: url,
        MODAL_TOKEN_ID: key,
        MODAL_TOKEN_SECRET: secret,
      } = process.env;
      if (
        !url ||
        !key ||
        !secret ||
        new URL(url).protocol !== "https:" ||
        !new URL(url).hostname.endsWith(".modal.run")
      )
        throw new ApiError(
          503,
          "SETUP",
          "Configure the deployed Modal depth URL and its proxy-token credentials.",
        );
      const image = await normalizeImage(body.data.image);
      takeBudget("depth", 30);
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(160_000),
        headers: {
          "Content-Type": "application/json",
          "Modal-Key": key,
          "Modal-Secret": secret,
        },
        body: JSON.stringify({ image }),
      });
      if (!response.ok)
        throw new ApiError(
          502,
          "MODAL",
          "Modal could not prepare this photo. Check deployment health and proxy-token access, then retry this stop.",
        );
      const result = DepthResponseSchema.parse(
        await readJson(response, 5_100_000),
      );
      return json(result);
    }
    if (action === "enhance") {
      const body = EnhanceRequestSchema.safeParse(
        await readJson(req, MAX_CLOUD_BODY_BYTES),
      );
      if (!body.success)
        throw new ApiError(
          400,
          "INPUT",
          "Choose one to three reference photos and confirm generation.",
        );
      if (!process.env.RUNWARE_API_KEY)
        throw new ApiError(
          503,
          "SETUP",
          "Add RUNWARE_API_KEY to the server environment, then restart the app.",
        );
      const images = await Promise.all(body.data.images.map(normalizeImage));
      const taskUUID = crypto.randomUUID();
      takeBudget("enhance", 12);
      const response = await fetch("https://api.runware.ai/v1", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(150_000),
        headers: {
          Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            taskType: "imageInference",
            taskUUID,
            model: "bfl:5@1",
            positivePrompt: body.data.prompt,
            inputs: { referenceImages: images },
            width: 1360,
            height: 768,
            numberResults: 1,
            outputType: "dataURI",
            outputFormat: "JPG",
            deliveryMethod: "sync",
            includeCost: true,
            safety: { checkContent: true },
          },
        ]),
      });
      if (!response.ok)
        throw new ApiError(
          502,
          "RUNWARE",
          "Runware could not generate this scene. Check your key, model access, and credits. Your source photo is unchanged.",
        );
      const result = z
        .object({
          data: z
            .array(
              z.object({
                taskUUID: z.string(),
                imageDataURI: z.string().optional(),
                cost: z.number().nonnegative().optional(),
              }),
            )
            .optional(),
        })
        .parse(await readJson(response, 8_000_000));
      const output = result.data?.find(
        (item) => item.taskUUID === taskUUID && item.imageDataURI,
      );
      if (!output?.imageDataURI)
        throw new ApiError(
          502,
          "RUNWARE",
          "Runware returned no image. The request may have been filtered or timed out; check the task in your Runware dashboard before retrying.",
        );
      return json({
        image: await normalizeImage(output.imageDataURI),
        ...(output.cost !== undefined ? { cost: output.cost } : {}),
      });
    }
    if (action === "journey") {
      const body = JourneyRequestSchema.safeParse(
        await readJson(req, MAX_CLOUD_BODY_BYTES),
      );
      if (!body.success)
        throw new ApiError(
          400,
          "INPUT",
          "Choose a valid photo and confirm clip generation.",
        );
      if (!process.env.RUNWARE_API_KEY)
        throw new ApiError(
          503,
          "SETUP",
          "Add RUNWARE_API_KEY to the server environment, then restart the app.",
        );
      const runware = (tasks: unknown[], timeout: number) =>
        fetch("https://api.runware.ai/v1", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(timeout),
          headers: {
            Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(tasks),
        });
      const taskUUID = body.data.task ?? crypto.randomUUID();
      if (!body.data.task) {
        takeBudget("journey", 20);
        const image = await normalizeImage(body.data.image!);
        const submit = await runware(
          [
            {
              taskType: "videoInference",
              taskUUID,
              model: "minimax:h3@max",
              positivePrompt: body.data.prompt,
              duration: 6,
              resolution: "768p",
              inputs: { frameImages: [{ image, frame: "first" }] },
              outputFormat: "MP4",
              ttl: 86400,
              deliveryMethod: "async",
              includeCost: true,
              safety: { checkContent: true },
            },
          ],
          30_000,
        );
        if (!submit.ok)
          throw new ApiError(
            502,
            "RUNWARE",
            "Runware could not start this clip. Check your key, model access, and credits.",
          );
        const ack = z
          .object({
            errors: z
              .array(z.object({ message: z.string() }))
              .optional(),
          })
          .parse(await readJson(submit, 1_000_000));
        if (ack.errors?.length)
          throw new ApiError(
            502,
            "RUNWARE",
            "Runware rejected this clip. Check your key, model access, and credits.",
          );
      }
      const clip = z.object({
        taskUUID: z.string(),
        status: z.string().optional(),
        videoURL: z.url().optional(),
        cost: z.number().nonnegative().optional(),
      });
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const poll = await runware(
          [{ taskType: "getResponse", taskUUID }],
          20_000,
        ).catch(() => null);
        if (!poll?.ok) continue;
        const result = z
          .object({ data: z.array(clip).optional() })
          .parse(await readJson(poll, 1_000_000));
        const item = result.data?.find(
          (entry) => entry.taskUUID === taskUUID,
        );
        if (item?.status === "error")
          throw new ApiError(
            502,
            "RUNWARE",
            "Runware could not generate this clip. The task may have been filtered; check your dashboard before retrying.",
          );
        if (item?.videoURL)
          return json({
            video: item.videoURL,
            ...(item.cost !== undefined ? { cost: item.cost } : {}),
          });
      }
      return json({ task: taskUUID });
    }
    throw new ApiError(404, "NOT_FOUND", "This endpoint does not exist.");
  } catch (error) {
    return errorResponse(error);
  }
}
