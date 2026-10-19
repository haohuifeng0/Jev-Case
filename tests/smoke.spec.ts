import { expect, test } from "@playwright/test";

test("renders the case wall and filters React state", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/case/2100356151468585346");
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

test("redirects a repost case to the original case", async ({ page }) => {
  await page.goto("/case/2100619720772694036");
  await expect(page).toHaveURL(/\/case\/2100356151468585346$/);
  await expect(page.locator(".origin-text")).toContainText("trading bot");
});

test("does not expose unpublished case ids", async ({ page }) => {
  const response = await page.goto("/case/2100714613381960186");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("这条信号不存在。")).toBeVisible();
});

test("switches case wall text to Chinese translations", async ({ page }) => {
  await page.goto("/");
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
  const response = await page.goto("/services/agent-decision-assessment");

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
