// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const dir = process.env.VIDEO_CHAT_SCREENSHOTS || "/tmp/video-chat-eval";
    const before = process.env.VIDEO_CHAT_BEFORE === "1";
    fs.mkdirSync(dir, { recursive: true });
    await page.goto((process.env.WORKFLOWS_PREVIEW_URL || "http://localhost:1431/preview") + "?catalog=video-chat");
    await page.getByRole("button", { name: "Open map" }).first().click();
    await page.getByRole("button", { name: "Create SOP", exact: true }).click();
    await page.getByText("Saved your SOP on this device. Review its steps on the page.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Minimize chat", exact: true }).click();
    await page.getByRole("button", { name: "Video SOP", exact: true }).click();
    await page.getByRole("button", { name: "Create video", exact: true }).click();
    await page.getByText("Creating narration", { exact: true }).waitFor();
    await page.screenshot({ path: dir + (before ? "/before.png" : "/streaming.png") });
    const chat = page.getByRole("region", { name: "Screenpipe assistant" });
    if (!before) {
      assert(await chat.isVisible());
      assert(await chat.getByRole("button", { name: "Stop answer" }).isVisible());
      assert(await page.getByRole("region", { name: "Video SOP", exact: true }).isVisible());
    }
    await page.getByLabel("Narrated SOP preview", { exact: true }).waitFor();
    if (before) return;
    await chat.getByText(/Your video is ready on the page/).waitFor();
    assert(await chat.isVisible());
    await page.screenshot({ path: dir + "/ready.png" });
    await chat.getByRole("button", { name: "Minimize chat" }).click();
    assert(await page.getByLabel("Narrated SOP preview").isVisible());
    await page.getByRole("button", { name: "Create new video", exact: true }).click();
    await chat.getByText("Creating narration", { exact: true }).waitFor();
    await chat.getByRole("button", { name: "Stop answer" }).click();
    await page.getByRole("button", { name: "Create new video", exact: true }).waitFor({ state: "visible" });
    await page.setViewportSize({ width: 900, height: 800 });
    await page.screenshot({ path: dir + "/compact.png" });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log("PASS fictional browser fixture: chat generation, page result, chat stays open, minimize, repeat, stop and compact layout");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
