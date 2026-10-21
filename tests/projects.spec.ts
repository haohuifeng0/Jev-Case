import { expect, test } from "@playwright/test";

const malformedProjectPaths = [
  "/projects/%3Cscript%3Eignore%3C%2Fscript%3E",
  "/projects/%2e%2e%2fsecret",
  "/projects/%FF",
  "/projects/foo%2Fbar",
  "/projects/foo%5Cbar",
] as const;
const modelRoutingStatuses = {
  "gargpratyush-jev-router": "有限验证",
  "minilv-jev-auto-router": "有限验证",
  "protocol-lattice-harness-router": "有限验证",
  "ruban-24-switchboard": "已验证",
  "ruivalim-decision-router": "有限验证",
} as const;
const toolSkillStatuses = {
  "godsboy-jev-agent-skill-router": "已验证",
  "safzanpirani-pi-jev-skill-picker": "有限验证",
  "dicklesworthstone-skillranker": "有限验证",
  "parkavenue9639-jevloop": "有限验证",
  "kerpopule-hermes-jev-skills": "已验证",
} as const;
const riskGateStatuses = {
  "y0usaf-pi-jev": "有限验证",
  "leepokai-jev-guard": "有限验证",
  "veridicaltech-edward": "有限验证",
  "qkal-canny": "已验证",
  "ckorhonen-jev-lint": "有限验证",
} as const;

test("lists catalog projects on the static discovery route", async ({ page }) => {
  // Given: the production catalog contains 624 unique projects.
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  const response = await page.goto("/projects");

  // When: the static discovery page is rendered.
  expect(response?.status()).toBe(200);

  // Then: projects remain available before filter controls hydrate.
  await expect(page.getByRole("heading", { level: 1, name: /项目目录/ })).toBeVisible();
  await expect(page.locator("[data-project-card]")).toHaveCount(624);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("keeps all project links available without JavaScript", async ({ browser }) => {
  // Given: a browser context with JavaScript disabled.
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();

    // When: the static project directory is requested.
    const response = await page.goto("/projects");

    // Then: the full catalog and native detail links remain browsable.
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-project-card]")).toHaveCount(624);
    await expect(page.locator('[data-project-card] a[href^="/projects/"]').first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("keeps native reset semantics without JavaScript", async ({ browser }) => {
  // Given: a no-JavaScript visitor changes native project controls.
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/projects");
    await page.getByRole("searchbox", { name: "搜索项目" }).fill("drone");
    await page.locator('select[name="agent"]').selectOption("multi");

    // When: the visitor activates the native reset control.
    await page.getByRole("button", { name: "重置筛选" }).focus();
    await page.keyboard.press("Enter");

    // Then: controls reset while all static project links remain available.
    await expect(page.getByRole("searchbox", { name: "搜索项目" })).toHaveValue("");
    await expect(page.locator('select[name="agent"]')).toHaveValue("");
    await expect(page.locator("[data-project-card]")).toHaveCount(624);
  } finally {
    await context.close();
  }
});

test("filters by Agent, type, category, and search without hydrating cards", async ({ page }) => {
  // Given: the static project directory with its small discovery controller.
  await page.goto("/projects?agent=multi");
  const cards = page.locator("[data-project-card]:visible");
  const agent = page.locator('select[name="agent"]');
  const type = page.locator('select[name="type"]');
  const category = page.locator('select[name="category"]');

  // When: filters are combined and then replaced by an exact search.
  await expect(agent).toHaveValue("multi");
  await expect(cards.first()).toHaveAttribute("data-agent", "multi");
  await type.selectOption("plugin");
  await category.selectOption("agent-decisions");
  await expect(cards.first()).toHaveAttribute("data-type", "plugin");
  await expect(cards.first()).toHaveAttribute("data-category", "agent-decisions");
  await agent.selectOption("");
  await type.selectOption("");
  await category.selectOption("");
  await page.getByRole("searchbox", { name: "搜索项目" }).fill(
    "scoring every tool call and result for whether it is still needed",
  );

  // Then: only the matching static card is visible.
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole("heading", { name: "fast-jev-compaction" })).toBeVisible();
});

test("shows an inert no-results state for malformed and prompt-like queries", async ({ page }) => {
  // Given: malformed facet values and prompt-like search text arrive through the URL.
  await page.goto("/projects?agent=not-a-real-agent&q=%3Cscript%3Ewindow.pwned%3Dtrue%3C%2Fscript%3E");

  // When: controls parse only known facet values and compare text without HTML insertion.
  const search = page.getByRole("searchbox", { name: "搜索项目" });

  // Then: the text remains literal, no script runs, and the empty state is announced.
  await expect(page.locator('select[name="agent"]')).toHaveValue("");
  await expect(search).toHaveValue("<script>window.pwned=true</script>");
  await expect(page.getByText("没有匹配的项目。请清除部分筛选条件后重试。")).toBeVisible();
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
});

test("resets all interactive filters, search, results, and query state", async ({ page }) => {
  // Given: URL and interactive filters have narrowed the static catalog to no results.
  await page.goto("/projects?agent=multi&q=not-a-real-project");
  await page.locator('select[name="type"]').selectOption("plugin");
  await expect(page.getByText("没有匹配的项目。请清除部分筛选条件后重试。")).toBeVisible();

  // When: the reset control is activated from the keyboard.
  const reset = page.getByRole("button", { name: "重置筛选" });
  await reset.focus();
  await page.keyboard.press("Enter");

  // Then: every control, result, and stale query parameter returns to the default state.
  await expect(page.getByRole("searchbox", { name: "搜索项目" })).toHaveValue("");
  await expect(page.locator('select[name="category"]')).toHaveValue("");
  await expect(page.locator('select[name="agent"]')).toHaveValue("");
  await expect(page.locator('select[name="type"]')).toHaveValue("");
  await expect(page.locator("[data-project-card]:visible")).toHaveCount(624);
  await expect(page.locator("[data-project-count]")).toHaveText("624");
  await expect(page.locator("[data-project-empty]")).toBeHidden();
  await expect(page).toHaveURL(/\/projects$/);
});

test("opens a project relation, provenance, and assessment path truthfully", async ({ page }) => {
  // Given: a project with one explicit X relation and no verification record.
  await page.goto("/projects/romanslack-jev-drone");

  // When: the detail page is inspected and its internal evidence link is opened.
  await expect(page.getByRole("heading", { level: 1, name: "jev-drone" })).toBeVisible();

  // Then: source metadata, unreviewed state, relation, and CTA remain explicit.
  await expect(page.getByText("e7aad0046c9013c6635a85a3a257f8508ecdb299")).toBeVisible();
  await expect(page.getByText("3e201993380901324edf9c99799eda2f5ee1b6c9731eeda4ef9a08f0f667ea1c")).toBeVisible();
  await expect(page.getByRole("status", { name: "验证状态：尚未审阅" })).toBeVisible();
  await expect(page.getByRole("status", { name: "验证状态：已验证" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "查看 X 证据 ↗" })).toHaveAttribute("href", /x\.com/);
  await page.getByRole("link", { name: "查看站内案例" }).click();
  await expect(page).toHaveURL(/\/case\/2100335978229690683$/);
  await page.goBack();
  await expect(page.getByRole("link", { name: /CNY 2,999 决策评估/ })).toHaveAttribute(
    "href",
    "/services/agent-decision-assessment",
  );
});

test("renders the five model-routing statuses with dated non-live evidence", async ({ page }) => {
  // Given: the five independently reviewed model-routing projects.
  for (const [slug, status] of Object.entries(modelRoutingStatuses)) {
    // When: each static project detail route is opened.
    const response = await page.goto(`/projects/${slug}`);

    // Then: its evidence-derived status, date, and no-live-call disclosure are visible.
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("status", { name: `验证状态：${status}` })).toBeVisible();
    await expect(page.getByText("2026-10-20")).toBeVisible();
    await expect(page.getByText(/no live Jev call was run or claimed/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "不可变证据" })).toBeVisible();
  }
});

test("renders the five tool-skill statuses with dated non-live evidence", async ({ page }) => {
  // Given: the five independently reviewed tool-skill projects.
  for (const [slug, status] of Object.entries(toolSkillStatuses)) {
    // When: each static project detail route is opened.
    const response = await page.goto(`/projects/${slug}`);

    // Then: its evidence-derived status, date, and no-live-call disclosure are visible.
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("status", { name: `验证状态：${status}` })).toBeVisible();
    await expect(page.getByText("2026-10-20")).toBeVisible();
    await expect(page.getByText(/no live Jev call was run or claimed/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "不可变证据" })).toBeVisible();
  }
});

test("renders the five risk-gate statuses with dated fail-behavior caveats", async ({ page }) => {
  // Given: the five independently reviewed risk-gate projects.
  for (const [slug, status] of Object.entries(riskGateStatuses)) {
    // When: each static project detail route is opened.
    const response = await page.goto(`/projects/${slug}`);

    // Then: its evidence-derived status, date, and conservative boundary disclosure are visible.
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("status", { name: `验证状态：${status}` })).toBeVisible();
    await expect(page.getByText("2026-10-21")).toBeVisible();
    await expect(page.getByText(/no live Jev call was run or claimed/i)).toBeVisible();
    await expect(page.locator(".verification-record__notes")).toContainText(
      /fail-open|not.*security boundary|not universal.*fail-closed/i,
    );
    await expect(page.getByRole("heading", { name: "不可变证据" })).toBeVisible();
  }
});

test("keeps project discovery keyboard reachable and overflow-free under reduced motion", async ({ page }) => {
  // Given: a reduced-motion browser at the configured desktop or mobile viewport.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/projects");

  // When: keyboard focus enters the discovery controls.
  await page.getByRole("searchbox", { name: "搜索项目" }).focus();

  // Then: focus is visible, the layout fits, and no card React roots are created.
  await expect(page.getByRole("searchbox", { name: "搜索项目" })).toBeFocused();
  const evidence = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    focusOutline: getComputedStyle(document.activeElement as Element).outlineStyle,
    reactRoots: document.querySelectorAll("[data-reactroot]").length,
  }));
  expect(evidence.overflow).toBeLessThanOrEqual(1);
  expect(evidence.focusOutline).not.toBe("none");
  expect(evidence.reactRoots).toBe(0);
});

test("serves malformed and unknown project slugs as a noindex static 404", async ({ page }) => {
  // Given: a slug that was not emitted by getStaticPaths.
  const response = await page.goto("/projects/not-a-real-project-slug");

  // When: the static host resolves the unknown route.
  // Then: it returns 404 and explicitly opts out of indexing.
  expect(response?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByText("这条信号不存在。")).toBeVisible();
});

for (const malformedPath of malformedProjectPaths) {
  test(`fails closed for raw project path ${malformedPath}`, async ({ request }) => {
    // Given: an encoded project path reaches the static preview boundary unchanged.
    // When: the path is requested over raw HTTP.
    const response = await request.get(malformedPath);
    const body = await response.text();

    // Then: the response is the inert custom 404 without runtime diagnostics.
    expect(response.status()).toBe(404);
    expect(body).toContain('name="robots" content="noindex, nofollow"');
    expect(body).toContain("这条信号不存在。");
    expect(body).not.toMatch(/ERR_|URIError|TypeError|fileURLToPath|<pre>/);
  });
}
