import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** Waits until a stat tile shows the expected count (numbers animate when they change). */
async function expectTile(page: Page, label: string, value: string) {
  const el = page.locator("section[aria-label='Audit overview'] div.grid > div").filter({ hasText: label }).first();
  await expect.poll(async () => (await el.locator("span.tabular-nums").first().innerText()).trim()).toBe(value);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__init")) {
      localStorage.clear();
      sessionStorage.setItem("__init", "1");
    }
  });
});

test("landing explains the product and leads to the demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Did your AI actually build it?");
  await expect(page.getByText("Every requirement. Every correction. Every omission.")).toBeVisible();
  await expect(page.getByText("3 of 5 aren't done.")).toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(1500);
  await shot(page, "01-landing");
  await page.getByRole("link", { name: "Explore the demo" }).first().click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByText("Illustrative project and conversation.")).toBeVisible();
});

test("signature flow: contradiction, evidence, history, fix prompt, rerun", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/app");
  await expect(page.getByText("Illustrative project and conversation.")).toBeVisible();

  await expectTile(page, "Proven", "5");
  await expectTile(page, "Contradicted", "3");
  await expectTile(page, "Missing", "2");
  await expectTile(page, "Unverifiable", "1");

  // First click target: the corrected-then-contradicted IST requirement is preselected.
  const inspector = page.locator("aside").last();
  await expect(inspector.getByRole("heading", { level: 2 })).toHaveText(/change all displayed times to IST/i);
  await expect(inspector.getByText("conflicts with what you asked")).toBeVisible();
  await expect(inspector.getByRole("button", { name: /src\/lib\/time\.ts:11/ }).first()).toBeVisible();
  await expect(inspector.getByText("Corrected", { exact: true })).toBeVisible();
  await expect(inspector.getByText(/Display all appointment times in UTC/)).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "02-workspace");

  // Evidence opens the real file at the cited line.
  await inspector.getByRole("button", { name: /src\/lib\/time\.ts:11/ }).first().click();
  const viewer = page.getByRole("dialog", { name: "src/lib/time.ts" });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('tr[data-line="11"]')).toContainText('timeZone: "UTC"');
  await shot(page, "03-file-viewer");
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  // Fix prompt.
  await page.getByRole("button", { name: "Fix prompt", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Fix prompt" });
  const text = sheet.locator("textarea");
  await expect(text).toHaveValue(/found 5 requirements that aren't done/);
  await expect(text).toHaveValue(/src\/lib\/time\.ts:11/);
  await expect(text).toHaveValue(/This replaces what I said earlier \(message 2\)/);
  await page.waitForTimeout(400);
  await shot(page, "04-fix-prompt");
  await sheet.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByText("Copied. Paste it into your coding agent.")).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Change all displayed times to IST");
  await sheet.getByRole("button", { name: "Back to audit" }).click();

  // Rerun against the fix commit.
  await page.getByRole("button", { name: "Rerun", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rerun audit" });
  await expect(dialog.getByText("src/lib/time.ts")).toBeVisible();
  await dialog.getByRole("button", { name: /Rerun against 7be21d4/ }).click();
  await expect(page.getByText(/Rerun complete: 5 verdicts changed/)).toBeVisible();
  await expect(page.getByText("No contradicted or missing requirements left.")).toBeVisible();
  await expect(page.getByText("selected for the fix prompt")).toBeHidden();
  await expectTile(page, "Proven", "10");
  await expectTile(page, "Contradicted", "0");
  await expectTile(page, "Unverifiable", "1");
  await expect(inspector.getByText("supports what you asked")).toBeVisible();
  await expect(page.locator("[data-row]").filter({ hasText: "was" }).first()).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "05-after-rerun");
});

test("override a verdict, then reset the demo", async ({ page }) => {
  await page.goto("/app");
  await page.locator("[data-row]").filter({ hasText: "Ensure the page works on mobile" }).click();
  const inspector = page.locator("aside").last();
  await expect(inspector.getByText("needs a human check")).toBeVisible();
  await inspector.getByRole("button", { name: "Disagree with this verdict?" }).click();
  await inspector.getByRole("radio", { name: "Proven" }).click();
  await inspector.getByRole("textbox").fill("Checked at 375px, no horizontal scroll");
  await inspector.getByRole("button", { name: "Save verdict" }).click();
  await expect(page.locator("[data-row]").filter({ hasText: "Ensure the page works on mobile" })).toContainText("set by you");
  await expectTile(page, "Proven", "6");

  await page.reload();
  await expectTile(page, "Proven", "6");

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expectTile(page, "Proven", "5");
});

test("keyboard navigation and search", async ({ page }) => {
  await page.goto("/app");
  const inspector = page.locator("aside").last();
  const before = await inspector.getByRole("heading", { level: 2 }).innerText();
  await page.locator("body").press("j");
  await expect(inspector.getByRole("heading", { level: 2 })).not.toHaveText(before);
  await page.locator("body").press("/");
  await expect(page.getByLabel("Search requirements")).toBeFocused();
  await page.keyboard.type("email");
  await expect(page.locator("[data-row]")).toHaveCount(1);
  await page.getByRole("button", { name: /^Missing/ }).click();
  await expect(page.locator("[data-row]")).toHaveCount(1);
});

test("paste a conversation without a repository", async ({ page }) => {
  await page.goto("/app#new");
  await expect(page.getByRole("heading", { name: "New audit" })).toBeVisible();
  await page.getByRole("tab", { name: "Paste a conversation" }).click();
  await page.getByRole("button", { name: "Load example" }).click();
  await expect(page.getByText("3 messages from you")).toBeVisible();
  await page.getByRole("tab", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByText(/Audit ready: \d+ requirements checked/)).toBeVisible();
  await expect(page.locator("[data-row]").filter({ hasText: "Remove the name field" })).toBeVisible();
  await expectTile(page, "Proven", "0");
  await shot(page, "06-paste-audit");
});

test("malformed Claude Code log shows an error instead of crashing", async ({ page }) => {
  await page.goto("/app#new");
  await page.getByRole("checkbox").check();
  await page.locator('input[type="file"][accept*="jsonl"]').setInputFiles({ name: "broken.jsonl", mimeType: "application/json", buffer: Buffer.from("not json\n{oops") });
  await expect(page.getByText("doesn't look like a Claude Code session log")).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("no horizontal scroll and the inspector opens as a sheet", async ({ page }) => {
    for (const path of ["/", "/app", "/app#new"]) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await page.goto("/app");
    await shot(page, "07-mobile-workspace");
    await page.locator("[data-row]").first().click();
    await expect(page.getByRole("dialog", { name: "Requirement details" })).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "08-mobile-inspector");
  });
});
