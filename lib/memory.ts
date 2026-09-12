import type { Memory, Photo } from "./contracts";

export function movePhoto(photos: Photo[], from: number, to: number): Photo[] {
  if (from < 0 || from >= photos.length || to < 0 || to >= photos.length)
    return photos;
  const next = [...photos];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function buildWorldPrompt(memory: Memory, photo: Photo): string {
  return `A steady first-person walking view of ${memory.place || memory.title}. The reference photograph is the visual source of truth. Preserve its architecture, terrain, vegetation, lighting, colors, and season. Maintain continuous geometry and natural scale as the camera moves at a relaxed walking pace. No cuts, teleportation, text overlays, or invented landmarks. Scene: ${photo.title}. Trip context: ${memory.description || "A quiet travel memory."} Personal recollection: ${photo.note || "Keep the scene as close to the photograph as possible."} Explore only plausible nearby surroundings, maintaining the identity of this place.`;
}

export function buildClipPrompt(
  memory: Memory,
  photo: Photo,
  next?: Photo,
): string {
  const place = memory.place || memory.title;
  if (next)
    return `One continuous cinematic first-person shot that begins inside the first photograph and drifts smoothly forward until it arrives at the second photograph's scene, like walking between two stops on the same trip. Smooth continuous motion, no cuts, no morphing artifacts, no people, no text. Preserve each scene's real architecture, terrain, colors, and light. Place: ${place}. From: ${photo.title}. To: ${next.title}.`;
  return `Slow cinematic first-person drift through this exact place, as if standing inside the photograph and gently moving forward. Preserve the architecture, terrain, colors, light, and season of the source image. Smooth continuous camera motion, no cuts, no people, no text, no invented landmarks. Place: ${place}. Scene: ${photo.title}. ${photo.note || ""}`;
}

export function navigationInput(keys: Set<string>) {
  return {
    longitudinal:
      keys.has("w") === keys.has("s")
        ? "idle"
        : keys.has("w")
          ? "forward"
          : "backward",
    lateral:
      keys.has("a") === keys.has("d")
        ? "idle"
        : keys.has("a")
          ? "left"
          : "right",
    horizontal:
      keys.has("ArrowLeft") === keys.has("ArrowRight")
        ? "idle"
        : keys.has("ArrowLeft")
          ? "left"
          : "right",
    vertical:
      keys.has("ArrowUp") === keys.has("ArrowDown")
        ? "idle"
        : keys.has("ArrowUp")
          ? "up"
          : "down",
  } as const;
}

export function formatDate(value: string): string {
  return value
    ? new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : "A moment worth keeping";
}
