import type { Memory } from "./contracts";

export const demoMemory: Memory = {
  id: "mountain-demo",
  title: "A mountain state of mind",
  place: "A sample photo journey",
  date: "",
  description:
    "Five photographs, a slower pace, and a little room to wander. This is a curated sample, not a reconstruction of a real route. Add your own photos to keep a place that means something to you.",
  createdAt: "2026-01-01T00:00:00.000Z",
  favorite: false,
  photos: [
    {
      id: "lake",
      title: "A morning by the lake",
      note: "The kind of quiet you wish you could bring home.",
      image: "/demo/lake.jpg",
      width: 1600,
      height: 1067,
    },
    {
      id: "peaks",
      title: "Looking up",
      note: "Some views make everything else feel a little smaller.",
      image: "/demo/peaks.jpg",
      width: 1600,
      height: 1067,
    },
    {
      id: "valley",
      title: "The long way round",
      note: "No hurry. No particular place to be.",
      image: "/demo/valley.jpg",
      width: 1600,
      height: 1067,
    },
    {
      id: "forest",
      title: "Under the canopy",
      note: "Cool air, tall trees, and the sound of our footsteps.",
      image: "/demo/forest.jpg",
      width: 1600,
      height: 1067,
    },
    {
      id: "evening",
      title: "One last look",
      note: "Stayed a little longer than we meant to.",
      image: "/demo/evening.jpg",
      width: 1600,
      height: 1067,
    },
  ],
};
