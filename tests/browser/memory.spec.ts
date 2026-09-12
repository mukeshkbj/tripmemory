import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { demoMemory } from "../../lib/demo";
import {
  MAX_CLOUD_BODY_BYTES,
  MAX_REFERENCE_DATA_LENGTH,
} from "../../lib/contracts";

const files = ["lake", "peaks", "valley", "forest", "evening"].map((name) =>
  resolve("public/demo", `${name}.jpg`),
);

async function createMemory(page: Page) {
  await page.goto("/#new");
  await page
    .getByLabel("Name your memory")
    .fill("The week we took the slow road");
  await page.getByLabel("Where were you?").fill("Our mountain escape");
  await page.getByLabel("When was it?").fill("2026-08-10");
  await page.locator("#photo-files").setInputFiles(files);
  await expect(
    page.getByRole("button", { name: "Create memory", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Create memory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The week we took the slow road" }),
  ).toBeVisible();
}

test("sample navigation is usable, responsive, and makes no paid requests", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    if (req.method() === "POST") requests.push(req.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("library.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Explore the sample mountain memory" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A morning by the lake" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next stop", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Looking up", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previous stop", exact: true })
    .click();
  await page.getByRole("button", { name: "Step inside", exact: true }).click();
  await expect(
    page.getByText("This is a read-only sample.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close options" }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset photo view" }).click();
  await expect
    .poll(() =>
      page
        .locator(".filmstrip img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("viewer.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test("create, reorder, annotate, favorite, export, import and delete a memory", async ({
  page,
}) => {
  await createMemory(page);
  await page.getByRole("button", { name: "Add your recollection" }).click();
  await page
    .getByRole("textbox", { name: "Note for lake" })
    .fill("The air smelled like pine and rain.");
  await expect(
    page.getByRole("button", { name: "Next stop", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByText("The air smelled like pine and rain.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("The air smelled like pine and rain.", { exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup.toString()).format).toBe("memory-v1");
  await page
    .getByRole("link", { name: "Your memories", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The week we took the slow road" }),
  ).toBeVisible();
  await page
    .locator('input[type="file"][accept="application/json,.json"]')
    .setInputFiles({
      name: "trip.memory.json",
      mimeType: "application/json",
      buffer: backup,
    });
  await expect(
    page.getByRole("heading", { name: "The week we took the slow road" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete memory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Delete this memory?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep memory", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete memory", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete memory", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$|\/#$/);
  await expect(
    page.getByRole("heading", { name: "The week we took the slow road" }),
  ).toHaveCount(1);
});

test("validates uploads, preserves draft navigation, and handles missing cloud setup", async ({
  page,
}, testInfo) => {
  await page.goto("/#new");
  await expect(
    page.getByRole("button", { name: "Create memory", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Name your memory").fill("An unfinished memory");
  await page.locator("#photo-files").setInputFiles({
    name: "nope.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator(".error-message[role=alert]")).toContainText(
    "choose a JPG",
  );
  await page.getByRole("link", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "AI connections",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unlock cloud", exact: true }),
  ).toBeDisabled();
  await page.goto("/#new");
  await page.getByLabel("Name your memory").fill("A real memory");
  await page.locator("#photo-files").setInputFiles(files);
  await page
    .getByRole("button", { name: "Move photo 1 later", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title for photo 1", exact: true }),
  ).toHaveValue("peaks");
  await page.screenshot({
    path: testInfo.outputPath("create.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create memory", exact: true })
    .click();
  await page.getByRole("button", { name: "Step inside", exact: true }).click();
  await expect(
    page.getByText("This service isn’t configured yet.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("spatial pipeline saves partial progress and generated scenes never replace source photos", async ({
  page,
}, testInfo) => {
  const depth =
    "data:image/png;base64," +
    (
      await sharp({
        create: { width: 32, height: 24, channels: 3, background: "#aaa" },
      })
        .png()
        .toBuffer()
    ).toString("base64");
  const image =
    "data:image/jpeg;base64," +
    (
      await sharp({
        create: { width: 32, height: 24, channels: 3, background: "#456b4a" },
      })
        .jpeg()
        .toBuffer()
    ).toString("base64");
  let depthCalls = 0;
  let fail = true;
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: {
        reactor: true,
        runware: true,
        modal: true,
        unlocked: true,
        accessRequired: true,
      },
    }),
  );
  await page.route("**/api/depth", (route) => {
    depthCalls++;
    return depthCalls === 2 && fail
      ? route.fulfill({
          status: 502,
          json: {
            error: {
              code: "MODAL",
              message: "A test failure. Retry this stop.",
            },
          },
        })
      : route.fulfill({
          json: { depth, model: "test-depth", width: 32, height: 24 },
        });
  });
  await page.route("**/api/enhance", (route) =>
    route.fulfill({ json: { image, cost: 0.01 } }),
  );
  await createMemory(page);
  const source = await page.locator(".scene-image").getAttribute("src");
  await page
    .getByRole("button", { name: "Prepare spatial views", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "Prepare spatial views", exact: true })
      .first(),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /Send the selected photos to Modal/ })
    .check();
  await page
    .getByRole("button", { name: "Prepare spatial views", exact: true })
    .first()
    .click();
  await expect(page.locator(".error-message[role=alert]")).toContainText(
    "A test failure",
  );
  expect(depthCalls).toBe(2);
  fail = false;
  await page
    .getByRole("button", { name: "Prepare spatial views", exact: true })
    .first()
    .click();
  await expect(page.locator(".spatial-canvas.visible")).toBeVisible();
  expect(depthCalls).toBe(6);
  await page.getByRole("button", { name: "Pan right", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("spatial.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create a landscape scene", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Send the selected photos to Runware/ })
    .check();
  await page
    .getByRole("button", { name: "Generate landscape scene", exact: true })
    .click();
  await expect(
    page.getByText("AI-generated · Runware", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".scene-image")).toHaveAttribute("src", image);
  await page.getByRole("button", { name: "Photograph", exact: true }).click();
  await expect(page.locator(".scene-image")).toHaveAttribute("src", source!);
  await page.reload();
  await page
    .getByRole("button", { name: "Generated scene", exact: true })
    .click();
  await expect(page.locator(".scene-image")).toHaveAttribute("src", image);
});

test("keyboard focus returns from cloud options and the layout holds at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page
    .getByRole("link", { name: "Explore the sample mountain memory" })
    .click();
  const start = page.getByRole("button", { name: "Step inside", exact: true });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cloud-panel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(start).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Next stop", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Your collection" }),
  ).toBeVisible();
});

test("failed Reactor authentication ends cleanly without opening a provider session", async ({
  page,
}) => {
  let tokens = 0;
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://api.reactor.inc"))
      externalRequests.push(request.url());
  });
  await page.route("**/api/capabilities", (route) =>
    route.fulfill({
      json: {
        reactor: true,
        runware: false,
        modal: false,
        unlocked: true,
        accessRequired: true,
      },
    }),
  );
  await page.route("**/api/token", (route) => {
    tokens++;
    return route.fulfill({
      status: 502,
      json: {
        error: { code: "REACTOR", message: "Test authentication failure." },
      },
    });
  });
  await createMemory(page);
  await page.getByRole("button", { name: "Step inside", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start live walk", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /Send the selected photo to Reactor/ })
    .check();
  await page
    .getByRole("button", { name: "Start live walk", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "We couldn’t keep this world open." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to photograph", exact: true })
    .click();
  await expect(
    page.getByText("Your photograph", { exact: true }),
  ).toBeVisible();
  expect(tokens).toBe(1);
  expect(externalRequests).toEqual([]);
});

test("API refuses cross-origin and unauthenticated generation", async ({
  request,
}) => {
  const crossOrigin = await request.post("/api/token", {
    headers: { Origin: "https://untrusted.example" },
    data: { consent: true },
  });
  expect(crossOrigin.status()).toBe(403);
  const unauthenticated = await request.post("/api/enhance", {
    headers: { Origin: "http://127.0.0.1:3001" },
    data: { consent: true },
  });
  expect([401, 503]).toContain(unauthenticated.status());
});
