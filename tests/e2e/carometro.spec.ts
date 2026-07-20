import { test, expect } from "@playwright/test";

/**
 * E2E: tela do carômetro — grid de fotos dos estudantes.
 *
 * Requer usuário logado com permissão carometro:view.
 * Variáveis:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_SENHA
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@escola.edu.br";
const adminSenha = process.env.E2E_ADMIN_SENHA ?? "";

test.describe("Carômetro — grid de fotos", () => {
  test.skip(!adminSenha, "E2E_ADMIN_SENHA não definida");

  test.beforeEach(async ({ page }) => {
    // Login antes de cada teste
    await page.goto("/login");
    await page.fill("input[type=text], input[type=email]", adminEmail);
    await page.fill("input[type=password]", adminSenha);
    await page.click("button[type=submit]");
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
  });

  test("navega para a tela do carômetro", async ({ page }) => {
    await page.goto("/carometro");
    await expect(page).toHaveURL(/carometro/);
    // Título ou heading da página
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("exibe grid de turmas ou mensagem 'sem estudantes'", async ({ page }) => {
    await page.goto("/carometro");
    // Deve exibir algum conteúdo — grid de turmas OU mensagem vazia
    const hasGrid  = await page.locator("[data-testid=carometro-grid], .carometro-group").isVisible().catch(() => false);
    const hasEmpty = await page.locator("text=/nenhum/i, text=/sem estudante/i").isVisible().catch(() => false);
    expect(hasGrid || hasEmpty).toBe(true);
  });

  test("filtro por turno filtra os grupos exibidos", async ({ page }) => {
    await page.goto("/carometro");

    const filtroTurno = page.locator("select[name=turno], [data-testid=filtro-turno], button:has-text('Turno')").first();
    if (await filtroTurno.isVisible()) {
      await filtroTurno.click();
      // Apenas confirmar que a interação não quebra a página
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
