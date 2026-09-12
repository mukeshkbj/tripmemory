import { describe, expect, it } from "vitest";
import {
  MemorySchema,
  DepthRequestSchema,
  EnhanceRequestSchema,
} from "../lib/contracts";
import { buildWorldPrompt, movePhoto, navigationInput } from "../lib/memory";

const photo = (id: string) => ({
  id,
  title: `Stop ${id}`,
  note: "",
  image: "data:image/jpeg;base64,/9j/",
  width: 1000,
  height: 750,
});
const memory = {
  id: "test",
  title: "A summer away",
  place: "Alps",
  date: "2026-08-10",
  description: "Quiet mountain paths",
  createdAt: "2026-08-12T00:00:00.000Z",
  photos: [1, 2, 3, 4, 5].map((n) => photo(String(n))),
  favorite: false,
};

describe("memory contracts", () => {
  it("accepts 5–10 photos and rejects remote image URLs in imported memories", () => {
    expect(MemorySchema.safeParse(memory).success).toBe(true);
    expect(
      MemorySchema.safeParse({ ...memory, photos: memory.photos.slice(0, 4) })
        .success,
    ).toBe(false);
    expect(
      MemorySchema.safeParse({
        ...memory,
        photos: [...memory.photos, ...memory.photos, photo("11")],
      }).success,
    ).toBe(false);
    expect(
      MemorySchema.safeParse({
        ...memory,
        photos: memory.photos.map((p) => ({
          ...p,
          image: "https://attacker.example/photo",
        })),
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate stop identifiers and impossible dates", () => {
    expect(
      MemorySchema.safeParse({ ...memory, photos: Array(5).fill(photo("1")) })
        .success,
    ).toBe(false);
    expect(
      MemorySchema.safeParse({ ...memory, date: "2026-02-31" }).success,
    ).toBe(false);
  });
  it("requires explicit cloud consent and bounds reference count", () => {
    expect(
      DepthRequestSchema.safeParse({ image: photo("1").image }).success,
    ).toBe(false);
    expect(
      EnhanceRequestSchema.safeParse({
        consent: true,
        images: [photo("1").image],
        prompt: "A quiet mountain trail",
      }).success,
    ).toBe(true);
    expect(
      EnhanceRequestSchema.safeParse({
        consent: true,
        images: Array(10).fill(photo("1").image),
        prompt: "A trail",
      }).success,
    ).toBe(false);
  });
});

describe("memory behavior", () => {
  it("reorders stops without losing their identity or modifying the source", () => {
    const reordered = movePhoto(memory.photos, 0, 3);
    expect(reordered.map((p) => p.id)).toEqual(["2", "3", "4", "1", "5"]);
    expect(memory.photos[0].id).toBe("1");
    expect(movePhoto(memory.photos, 0, -1)).toEqual(memory.photos);
  });
  it("grounds the world in the selected stop and preserves the memory context", () => {
    const prompt = buildWorldPrompt(memory, {
      ...photo("1"),
      note: "The lake was completely still.",
    });
    expect(prompt).toContain("Alps");
    expect(prompt).toContain("The lake was completely still.");
    expect(prompt).toContain("first-person");
    expect(prompt).toContain("architecture");
  });
  it("releases movement to neutral and cancels opposing keys", () => {
    expect(navigationInput(new Set(["w"])).longitudinal).toBe("forward");
    expect(navigationInput(new Set(["w", "s"])).longitudinal).toBe("idle");
    expect(navigationInput(new Set(["a", "ArrowRight"]))).toEqual({
      longitudinal: "idle",
      lateral: "left",
      horizontal: "right",
      vertical: "idle",
    });
    expect(navigationInput(new Set()).longitudinal).toBe("idle");
  });
});
