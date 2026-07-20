import { test, expect } from "@playwright/test";

/**
 * E2E: fluxo de autenticação
 *
 * Pré-requisito: `pnpm --filter @workspace/scripts run seed-admin`
 * para ter pelo menos um usuário administrador no banco.
 *
 * Variáveis:
 *   E2E_ADMIN_EMAIL  — e-mail do admin (padrão: admin@escola.edu.br)
 *   E2E_ADMIN_SENHA  — senha do admin (obrigatória)
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin@escola.edu.br";
const adminSenha = process.env.E2E_ADMIN_SENHA ?? "";

test.describe("Login e autenticação", () => {
  test.beforeEach(async ({ page }) => {
    // Garantir que estamos deslogados antes de cada teste
    await page.goto("/login");
  });

  test("exibe formulário de login ao acessar a raiz sem sessão", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
    await expect(page.getByRole("heading", { name: /carômetro/i })).toBeVisible();
  });

  test("exibe erro ao submeter credenciais inválidas", async ({ page }) => {
    await page.fill("[placeholder*='mail'], [placeholder*='código'], input[type=text]", "naoexiste@teste.com");
    await page.fill("input[type=password]", "senhaerrada");
    await page.click("button[type=submit]");

    // Deve exibir mensagem de erro (toast ou campo de erro)
    await expect(page.locator("[role=alert], [data-testid=error], .toast")).toBeVisible({ timeout: 5000 });
  });

  test.describe("Com credenciais válidas", () => {
    test.skip(!adminSenha, "E2E_ADMIN_SENHA não definida — pule este teste localmente");

    test("login bem-sucedido redireciona para dashboard", async ({ page }) => {
      const emailInput = page.locator("input").first();
      const senhaInput = page.locator("input[type=password]");

      await emailInput.fill(adminEmail);
      await senhaInput.fill(adminSenha);
      await page.click("button[type=submit]");

      // Após login, deve sair da tela de login
      await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
      // Header ou sidebar com nome do usuário deve aparecer
      await expect(page.locator("nav, aside, header")).toBeVisible();
    });

    test("logout limpa sessão e redireciona para login", async ({ page }) => {
      // Login
      await page.fill("input[type=text], input[type=email]", adminEmail);
      await page.fill("input[type=password]", adminSenha);
      await page.click("button[type=submit]");
      await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });

      // Logout — procurar botão ou link de logout
      const logoutBtn = page.locator("button:has-text('Sair'), button:has-text('Logout'), [data-testid=logout]");
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
      }
    });
  });
});
