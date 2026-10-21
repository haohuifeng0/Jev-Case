import { expect, test } from "@playwright/test";

const outputVerificationStatuses = {
  "different-ai-openwork": "有限验证",
  "thruwire-foreman": "已验证",
  "tech-byte-frontier-jevgate": "已验证",
  blink: "未验证",
  "egma-ai-jev-code-reviewer": "已验证",
} as const;

test("renders five output-verification statuses with truthful source limits", async ({ page }) => {
  // Given: the five independently reviewed output-verification projects.
  for (const [slug, status] of Object.entries(outputVerificationStatuses)) {
    // When: each static project detail route is opened.
    const response = await page.goto(`/projects/${slug}`);

    // Then: status, review date, scope, and source availability remain explicit.
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("status", { name: `验证状态：${status}` })).toBeVisible();
    await expect(page.getByText("2026-10-21")).toBeVisible();
    await expect(page.getByText(/no live Jev call was run or claimed/i)).toBeVisible();
    if (slug === "blink") {
      await expect(page.getByRole("heading", { name: "不可变证据" })).toHaveCount(0);
      await expect(page.locator(".verification-record__notes")).toContainText(
        /public beta.*No official immutable public source repository/i,
      );
    } else {
      await expect(page.getByRole("heading", { name: "不可变证据" })).toBeVisible();
    }
  }
});
