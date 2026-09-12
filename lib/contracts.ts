import { z } from "zod";

export const MAX_CLOUD_BODY_BYTES = 4_000_000;
export const MAX_REFERENCE_DATA_LENGTH = 1_100_000;

export const ImageDataSchema = z
  .string()
  .max(5_000_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
const SavedImageSchema = z.union([
  ImageDataSchema,
  z.string().regex(/^\/(demo|demo-trip)\/[a-z-]+\.jpg$/),
]);
export const PhotoSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  note: z.string().max(1000),
  image: SavedImageSchema,
  width: z.number().int().min(1).max(12000),
  height: z.number().int().min(1).max(12000),
  depth: ImageDataSchema.optional(),
  enhanced: ImageDataSchema.optional(),
  clip: z.url().max(1000).optional(),
  clipTo: z.string().max(80).optional(),
});
const DateSchema = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Choose a valid date.",
  );
export const MemorySchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  place: z.string().trim().max(120),
  date: DateSchema,
  description: z.string().max(1500),
  createdAt: z.iso.datetime(),
  photos: z
    .array(PhotoSchema)
    .min(5)
    .max(10)
    .refine(
      (photos) =>
        new Set(photos.map((photo) => photo.id)).size === photos.length,
      "Each stop needs a unique identifier.",
    ),
  favorite: z.boolean(),
});
export const ArchiveSchema = z.object({
  format: z.literal("memory-v1"),
  memory: MemorySchema,
});
export const DepthRequestSchema = z.object({
  consent: z.literal(true),
  image: ImageDataSchema.max(MAX_REFERENCE_DATA_LENGTH),
});
export const DepthResponseSchema = z.object({
  depth: ImageDataSchema,
  model: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export const EnhanceRequestSchema = z.object({
  consent: z.literal(true),
  images: z.array(ImageDataSchema.max(MAX_REFERENCE_DATA_LENGTH)).min(1).max(3),
  prompt: z.string().trim().min(3).max(2000),
});
export const EnhanceResponseSchema = z.object({
  image: ImageDataSchema,
  cost: z.number().nonnegative().optional(),
});
export const JourneyRequestSchema = z
  .object({
    consent: z.literal(true),
    image: ImageDataSchema.max(MAX_REFERENCE_DATA_LENGTH).optional(),
    image2: ImageDataSchema.max(MAX_REFERENCE_DATA_LENGTH).optional(),
    prompt: z.string().trim().min(3).max(2000).optional(),
    task: z.uuid().optional(),
  })
  .refine((value) => Boolean(value.task || (value.image && value.prompt)), {
    message: "Choose a photo and prompt, or an existing clip task.",
  });
export const JourneyResponseSchema = z.object({
  video: z.url().optional(),
  task: z.string().optional(),
  cost: z.number().nonnegative().optional(),
});
export const TokenResponseSchema = z.object({
  jwt: z.string().min(1),
  expires_at: z.number().positive(),
});
export const CapabilitiesSchema = z.object({
  reactor: z.boolean(),
  runware: z.boolean(),
  modal: z.boolean(),
  unlocked: z.boolean(),
  accessRequired: z.boolean(),
});
export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type Photo = z.infer<typeof PhotoSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
