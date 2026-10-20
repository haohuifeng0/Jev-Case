import { expect, test } from "@playwright/test";
import { serializeJsonLd } from "../src/lib/metadata";

test.beforeEach(async ({ context }) => {
  await context.route(
    (url) => url.origin !== "http://127.0.0.1:4321",
    (route) => route.abort("blockedbyclient"),
  );
});

test("renders the case wall and filters React state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#page-title")).toContainText("JEV 在 X 上");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-case-wall-ready="true"]') !== null,
  );
  const totalCases = await page.locator(".case-card").count();
  const videoCases = await page.locator(".case-card video").count();
  expect(totalCases).toBeGreaterThan(100);
  expect(videoCases).toBeGreaterThan(140);
  await expect(page.locator(".case-card video source").first()).toHaveAttribute(
    "src",
    /^https:\/\//,
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLVideoElement>(".case-card video")].filter(
        (video) => !video.paused,
      ).length <= 1,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "引用", exact: true }).click();
  const quoteCases = await page.locator(".case-card").count();
  expect(quoteCases).toBeGreaterThan(0);
  expect(quoteCases).toBeLessThan(totalCases);

  await page.locator('input[type="search"]').fill("not-a-real-case-signal");
  await expect(page.getByText("没有匹配的案例")).toBeVisible();
});

test("renders a static case page with source metadata", async ({ page }) => {
  await page.goto("/case/2100356151468585346", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".origin-text")).toContainText("trading bot");
  await expect(page.locator(".translation-block").first()).toContainText(
    "中文翻译",
  );
  await expect(page.locator(".detail-video")).toBeVisible();
  await expect(page.getByText("转载与衍生")).toBeVisible();
  await expect(page.getByRole("link", { name: /查看 X 原帖/ })).toHaveAttribute(
    "href",
    "https://x.com/jarrodwatts/status/2100356151468585346",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /2100356151468585346/,
  );
});

test("preserves case text and provenance when external media fails", async ({ page }) => {
  // Given: external media requests are blocked by the suite boundary.
  await page.goto("/case/2100356151468585346", { waitUntil: "domcontentloaded" });

  // When: the video reports its unavailable state.
  await expect(page.getByText("媒体暂不可用；案例文本与原帖来源仍可查阅")).toBeVisible();

  // Then: the original text and source link remain usable.
  await expect(page.locator(".origin-text")).toContainText("trading bot");
  await expect(page.getByRole("link", { name: /查看 X 原帖/ })).toHaveAttribute(
    "href",
    "https://x.com/jarrodwatts/status/2100356151468585346",
  );
});

test("redirects a repost case to the original case", async ({ page }) => {
  await page.goto("/case/2100619720772694036", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/case\/2100356151468585346$/);
  await expect(page.locator(".origin-text")).toContainText("trading bot");
});

test("does not expose unpublished case ids", async ({ page }) => {
  const response = await page.goto("/case/2100714613381960186", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
  await expect(page.getByText("这条信号不存在。")).toBeVisible();
});

test("switches case wall text to Chinese translations", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const card = page.locator('a[href="/case/2100694549362553153"]');
  await expect(card.locator(".original-text")).toBeVisible();
  await expect(card.locator(".translated-text")).toBeHidden();

  await page.getByRole("checkbox", { name: "中文翻译" }).check();
  await expect(card.locator(".original-text")).toBeHidden();
  await expect(card.locator(".translated-text")).toBeVisible();
  await expect(card.locator(".translated-text")).toContainText("瞬时压实");
});

test("opens the external assessment path without claiming submission", async ({ page }) => {
  // Given: the assessment service route is opened with a CTA event observer.
  await page.addInitScript(() => {
    window.addEventListener("jev:cta-open", (event) => {
      document.documentElement.dataset.ctaEvent = JSON.stringify(event.detail);
    });
  });
  const response = await page.goto("/services/agent-decision-assessment", { waitUntil: "domcontentloaded" });

  // When: the user inspects and activates the external assessment CTA.
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Agent 决策评估");
  await expect(page.getByText("CNY 2,999", { exact: true }).first()).toBeVisible();
  const cta = page.getByRole("link", { name: "前往飞书填写评估申请" }).first();
  await expect(cta).toHaveAttribute("rel", "noopener noreferrer nofollow");
  await cta.evaluate((link) => link.addEventListener("click", (event) => event.preventDefault()));
  await cta.click();

  // Then: only an open event and fixed, non-sensitive attribution are observable.
  const href = await cta.getAttribute("href");
  expect(href).toContain("source=service-assessment");
  expect(href).toContain("utm_source=jev-case");
  expect(await page.locator("html").getAttribute("data-cta-event")).toBe(
    JSON.stringify({
      name: "assessment-form",
      source: "service-assessment",
      destination: "external-form",
    }),
  );
  await expect(page.getByText(/提交后由飞书接收/).first()).toBeVisible();
  await expect(page.getByText(/提交成功/)).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("explains verification states and stale evidence accessibly", async ({ page }) => {
  // Given: the public methodology route.
  const response = await page.goto("/methodology", { waitUntil: "domcontentloaded" });

  // When: a reader inspects the status rubric and evidence policy.
  expect(response?.status()).toBe(200);

  // Then: all states, expiry, and trust boundaries are explicit without a score.
  await expect(page.getByRole("heading", { level: 1, name: "项目验证方法" })).toBeVisible();
  await expect(page.getByRole("status", { name: "验证状态：已验证" })).toBeVisible();
  await expect(page.getByRole("status", { name: "验证状态：有限验证" })).toBeVisible();
  await expect(page.getByRole("status", { name: "验证状态：未验证" })).toBeVisible();
  await expect(page.getByText("需要复查", { exact: true })).toBeVisible();
  await expect(page.getByText(/收录不等于背书/)).toBeVisible();
  await expect(page.getByText(/赞助.*不改变验证状态/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "更正或移除" })).toBeVisible();
  await expect(page.getByText(/综合评分|总分/)).toHaveCount(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("follows the launch path with keyboard navigation and inert hostile metadata", async ({ page }) => {
  // Given: reduced motion, a hostile JSON-LD value, and the public home page.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<script type="application/ld+json">${serializeJsonLd({
    text: "</script><script>globalThis.pwned=true</script>",
  })}</script>`);
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
  await page.goto("/");

  // When: a keyboard user traverses scenario, project, related case, and service routes.
  await page.getByRole("link", { name: "场景", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/scenarios\/model-routing$/);
  await page.getByRole("link", { name: "项目", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "jev-drone", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "查看站内案例" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/case\/2100335978229690683$/);
  await page.getByRole("link", { name: "服务" }).focus();
  await page.keyboard.press("Enter");

  // Then: the service is reached without overflow and focus remains visible.
  await expect(page).toHaveURL(/\/services\/agent-decision-assessment$/);
  await page.getByRole("link", { name: "前往飞书填写评估申请" }).first().focus();
  const evidence = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    focusOutline: document.activeElement instanceof Element
      ? getComputedStyle(document.activeElement).outlineStyle
      : "none",
  }));
  expect(evidence.overflow).toBeLessThanOrEqual(1);
  expect(evidence.reducedMotion).toBe(true);
  expect(evidence.focusOutline).not.toBe("none");
});
