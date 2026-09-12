# Memory

This app is independent of `/Users/mukeshagrawal/hackathonproj`; use that project as a Reactor reference, not a write target.

## Verification

- Run `pnpm verify`, `pnpm modal:check`, and `pnpm test:e2e` before handing off behavioral changes.
- `pnpm dev` uses port 3001 to avoid HazardLab on port 3000. Do not run a build while the dev server is writing `.next`.
- Python contract tests use `.venv`. Initialize with `python3 -m venv --system-site-packages .venv` and `.venv/bin/python -m pip install Pillow==12.0.0 numpy==2.3.5`. The system Python provides Modal; GPU dependencies are built remotely in the Modal image.
- Browser provider fixtures test UI and API contracts, not model quality or authenticated live service availability.

## Boundaries

- This is a single-owner, local-first journal. IndexedDB stores resized, EXIF-free photo copies, notes, and generated artifacts. It is not cloud backup or a multi-user account system. Export/import is the portability path.
- A photo sequence is not a geographic map. Spatial views use inferred relative depth, not measured reconstruction. Reactor generates a live world from one selected seed photo; it does not fuse the album into a geometrically consistent place.
- Preserve source photos separately from Runware artifacts, and label all generated scenes. New cloud actions need explicit photo-sharing and paid-resource consent.
- Keep credentials server-side. Configure `.env.local` using the names in `.env.example`; never print values. Cloud APIs require a signed session unlocked with `MEMORY_ACCESS_CODE` (at least 16 characters). Requests must be same-origin (Origin host must match the Host header; loopback names are equivalent). `MEMORY_SITE_ORIGIN` and Vercel system hosts add extra trusted origins when a proxy makes Origin and Host differ.
- `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are Modal **proxy-token** credentials, not CLI authentication tokens. The depth URL must be the HTTPS `.modal.run` endpoint produced by `pnpm modal:deploy`; provision proxy tokens with `modal workspace proxy-tokens create`. The app access code stays in `.env.local`; enter it in Connections to unlock.
- This is a temporary hackathon app. Keep photos, notes, and generated artifacts in browser-local IndexedDB; do not add a hosted database or distributed rate-limit service. Real AI calls go to Reactor, Runware, and Modal, with no simulated production results.
- Deployment and real provider tests use paid resources; obtain explicit approval first. Request budgets are deliberately in-memory and per-process, so they reset on cold starts and are not a global spending cap. Keep provider-side spending limits.
- Reactor tokens are session-scoped. Use the same JWT for every operation of one session. Replacing it mid-session can orphan the stream. Movement persists until an explicit neutral command; clear held input on release, blur, pause, and cleanup.

## Vercel deployment

- The Next.js frontend and API routes run on Vercel with Node 24 and Fluid compute. The GPU worker stays on Modal; do not deploy the Python worker or `.venv` to Vercel.
- Copy the six provider/access settings from `.env.local` into Vercel environment variables. Keep credentials server-only. Vercel's deployment, branch, and production system hostnames supply the allowed origins automatically. Only set `MEMORY_SITE_ORIGIN` for an additional exact HTTPS origin; do not copy the localhost value to Vercel.
- Preserve the shared 4 MB HTTP payload budget, below Vercel's 4.5 MB limit. `imageData` creates bounded cloud reference copies without modifying the local photo. Reactor media streams directly to the browser rather than through a Vercel Function.
- This remains a protected, single-owner demo. Share the app access code privately with judges, never in a public project description.
- Localhost and deployed domains have separate IndexedDB collections. Use export/import to move a memory between them.

## Assets

Bundled sample photographs are Unsplash images: `photo-1470770841072-f978cf4d019e`, `photo-1454496522488-7a8e488e8606`, `photo-1469474968028-56623f02e42e`, `photo-1441974231531-c6227db76b6e`, and `photo-1500530855697-b586d89ba3ee`. The sample is a curated photo journey, not a verified route.

The `demoTrip` coast journey in `public/demo-trip/` adds `photo-1469854523086-cc02fe5d8800`, `photo-1507525428034-b723cf961d3e`, `photo-1516483638261-f4dbaf036963`, `photo-1449034446853-66c86144b0ad`, and `photo-1503803548695-c2a7b4a5b875`. It is seeded into IndexedDB once per browser (flag `memory.seeded.demoTrip`) so every cloud feature works on it; deleting it does not reseed.
