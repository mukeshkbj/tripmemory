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

export const demoTrip: Memory = {
  id: "coast-trip-demo",
  title: "A week on the coast",
  place: "A sample road trip",
  date: "2026-03-16",
  description:
    "Five stops from the highway to the horizon. This is a bundled sample trip so you can try every feature right away. Delete it whenever you're ready to keep your own.",
  createdAt: "2026-03-20T00:00:00.000Z",
  favorite: false,
  photos: [
    {
      id: "road",
      title: "Miles of open road",
      note: "Windows down, nowhere to be until sundown.",
      image: "/demo-trip/road.jpg",
      width: 1600,
      height: 1131,
    },
    {
      id: "shore",
      title: "First stop: the water",
      note: "Colder than it looked. Worth it anyway.",
      image: "/demo-trip/shore.jpg",
      width: 1600,
      height: 1064,
    },
    {
      id: "village",
      title: "The town on the cliff",
      note: "Every color in the box, stacked above the sea.",
      image: "/demo-trip/village.jpg",
      width: 1600,
      height: 2409,
    },
    {
      id: "bay",
      title: "Crossing the bay",
      note: "Golden hour doing all the work.",
      image: "/demo-trip/bay.jpg",
      width: 1600,
      height: 1067,
    },
    {
      id: "sundown",
      title: "Last light",
      note: "We stayed until the sun actually left.",
      image: "/demo-trip/sundown.jpg",
      width: 1600,
      height: 1067,
    },
  ],
};
