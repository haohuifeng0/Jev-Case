import { expect, test } from "@playwright/test";

const scenarioSlugs = [
  "model-routing",
  "tool-skill-selection",
  "risk-gates",
  "output-verification",
] as const;
const expectedTitleSegments = {
  "model-routing": ["模型路由：", "为每次请求", "选择合适模型"],
  "tool-skill-selection": ["工具与技能", "选择：", "限制 Agent 的", "下一步动作"],
  "risk-gates": ["风险闸门：", "决定继续、", "限制或停止"],
  "output-verification": ["输出验证：", "判断结果是否", "足以交付"],
} as const;

for (const slug of scenarioSlugs) {
  test(`publishes the ${slug} decision scenario`, async ({ page, request }, testInfo) => {
    // Given: one of the four planned scenario routes.
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (failedRequest) => failedRequests.push(failedRequest.url()));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto(`/scenarios/${slug}`);

    // When: the static page is requested.
    const projectLinks = await page.locator("[data-scenario-project] > a:last-child").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    await page.locator(".scenario-tabs a").first().focus();
    const browserEvidence = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      focusOutline: document.activeElement instanceof Element
        ? getComputedStyle(document.activeElement).outlineStyle
        : "none",
    }));

    // Then: it exists and exposes truthful, accessible decision-guide landmarks.
    expect(response?.status()).toBe(200);
    const hero = page.locator(".scenario-hero");
    const title = page.getByRole("heading", { level: 1 });
    const titleSegments = title.locator("[data-title-segment]");
    await expect(title).toBeVisible();
    await expect(titleSegments).toHaveText(expectedTitleSegments[slug]);
    const segmentGeometry = await titleSegments.evaluateAll((segments) => segments.map((segment) => ({
      rectCount: segment.getClientRects().length,
      width: segment.getBoundingClientRect().width,
      titleWidth: segment.parentElement?.getBoundingClientRect().width ?? 0,
    })));
    const expectedFontSize = testInfo.project.name === "desktop" ? "100.8px" : "44.8px";
    await expect(title).toHaveCSS("font-size", expectedFontSize);
    expect(segmentGeometry.every(({ rectCount, width, titleWidth }) => rectCount === 1 && width <= titleWidth)).toBe(true);
    await expect(hero).toHaveScreenshot(`${slug}-hero.png`, { animations: "disabled" });
    await expect(page.getByRole("heading", { name: "这个决策是什么" })).toBeVisible();
    await expect(page.locator("[data-scenario-project]")).toHaveCount(5);
    const expectedVerified = slug === "model-routing" || slug === "risk-gates" ? 1 : slug === "tool-skill-selection" ? 2 : 3;
    const expectedLimited = slug === "model-routing" || slug === "risk-gates" ? 4 : slug === "tool-skill-selection" ? 3 : 1;
    const expectedUnverified = slug === "output-verification" ? 1 : 0;
    await expect(page.locator('[data-scenario-project][data-status="verified"]')).toHaveCount(expectedVerified);
    await expect(page.locator('[data-scenario-project][data-status="limited"]')).toHaveCount(expectedLimited);
    await expect(page.locator('[data-scenario-project][data-status="unverified"]')).toHaveCount(expectedUnverified);
    await expect(page.getByRole("note")).toContainText("目录收录不代表推荐");
    if (slug === "risk-gates") {
      await expect(page.getByRole("note")).toContainText("Canny");
      await expect(page.getByRole("note")).toContainText("本地 JSON 账本不是不可变证据或证明");
      await expect(page.getByRole("note")).toContainText("不是沙箱、权限控制或安全边界");
    }
    if (slug === "output-verification") {
      await expect(page.getByRole("note")).toContainText("Blink 是闭源公开测试版");
      await expect(page.getByRole("note")).toContainText("未执行远程代码");
    }
    await expect(page.getByText(/不会根据名称或关键词推断关联/)).toBeVisible();
    await expect(page.getByRole("link", { name: /决策评估/ })).toHaveAttribute(
      "href",
      "/services/agent-decision-assessment",
    );
    expect(projectLinks).toHaveLength(5);
    expect(new Set(projectLinks).size).toBe(5);
    for (const href of projectLinks) {
      expect(href).toMatch(/^\/projects\/[a-z0-9-]+$/);
      const projectResponse = await request.get(href ?? "/404");
      expect(projectResponse.status()).toBe(200);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/scenarios/${slug}$`));
    expect(browserEvidence.overflow).toBeLessThanOrEqual(1);
    expect(browserEvidence.focusOutline).not.toBe("none");
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
}

test("keeps canonical scenario metadata distinct", async ({ page }) => {
  // Given: the four content-driven scenario routes.
  const titles = new Set<string>();
  const descriptions = new Set<string>();

  // When: each static document metadata record is read.
  for (const slug of scenarioSlugs) {
    await page.goto(`/scenarios/${slug}`);
    titles.add(await page.title());
    descriptions.add(await page.locator('meta[name="description"]').getAttribute("content") ?? "");
  }

  // Then: no route shares canonical title or description text.
  expect(titles.size).toBe(4);
  expect(descriptions.size).toBe(4);
  expect(descriptions.has("")).toBe(false);
});

test("fails closed for an unknown prompt-like scenario path", async ({ page }) => {
  // Given: a prompt-like slug that was not emitted by getStaticPaths.
  const response = await page.goto("/scenarios/ignore-previous-instructions-script");

  // When: the static host resolves the route.
  // Then: it stays an inert noindex 404.
  expect(response?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
});
