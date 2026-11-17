import { test as base, expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(__dirname, "..");

function runSql(sql: string) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "compose.atividade.e2e.yml",
      "-p",
      "atividade-e2e",
      "exec",
      "-T",
      "database",
      "psql",
      "-U",
      "postgres",
      "-d",
      "atividade_e2e",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
      input: sql,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Falha ao executar SQL no banco E2E da atividade: ${result.error?.message ?? result.stderr}`,
    );
  }
}

export function resetDatabaseWithSeed() {
  const seed = readFileSync(resolve(rootDir, "database/seed.sql"), "utf8");
  runSql(
    "TRUNCATE enrollments, courses, students RESTART IDENTITY CASCADE;\n" +
      seed,
  );
}

export function clearStudentsDatabase() {
  runSql("TRUNCATE enrollments, students RESTART IDENTITY CASCADE;");
}

export async function gotoAndWaitInitialList(page: Page) {
  const initialGet = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/students" &&
      response.request().method() === "GET",
  );
  await page.goto("/");
  const response = await initialGet;
  expect(response.status()).toBe(200);
  await expect(page.locator("#students")).toHaveAttribute("aria-busy", "false");
}

export const test = base.extend({
  page: async ({ page }, use) => {
    resetDatabaseWithSeed();
    await gotoAndWaitInitialList(page);
    await use(page);
  },
});

export { expect };

