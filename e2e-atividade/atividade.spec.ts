import { test, expect, clearStudentsDatabase } from "./support";

const SEEDED_STUDENTS = [
  { ra: "258001", name: "Ana Clara Silva" },
  { ra: "258002", name: "Bruno Henrique Santos" },
  { ra: "258003", name: "Camila Oliveira Souza" },
];

test.describe("Cadastro de alunos - Atividade E2E", () => {
  test("listagem inicial exibe os alunos existentes no banco", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Cadastro de alunos" }),
    ).toBeVisible();
    await expect(page.getByTestId("list-message")).toHaveText("");
    await expect(page.getByTestId("list-message")).toHaveAttribute(
      "data-state",
      "success",
    );

    const rows = page.getByTestId("student-row");
    await expect(rows).toHaveCount(SEEDED_STUDENTS.length);

    for (let i = 0; i < SEEDED_STUDENTS.length; i++) {
      const cells = rows.nth(i).locator("td");
      await expect(cells).toHaveText([
        SEEDED_STUDENTS[i].ra,
        SEEDED_STUDENTS[i].name,
      ]);
    }
  });

  test("cadastro válido exibe mensagem de sucesso, atualiza a lista sem recarregar e limpa o formulário", async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    const raInput = page.getByLabel("RA", { exact: true });
    const nameInput = page.getByLabel("Nome", { exact: true });
    const submitButton = page.getByRole("button", { name: "Cadastrar aluno" });

    await raInput.fill("900001");
    await nameInput.fill("Mariana Costa");

    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "POST",
    );
    const reloadListResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "GET",
    );

    await submitButton.click();

    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    expect(await createResponse.json()).toEqual({
      ra: 900001,
      name: "Mariana Costa",
    });

    const reloadListResponse = await reloadListResponsePromise;
    expect(reloadListResponse.status()).toBe(200);

    // Mensagem de sucesso visível ao usuário
    const formMessage = page.getByTestId("form-message");
    await expect(formMessage).toHaveText("Aluno cadastrado com sucesso.");
    await expect(formMessage).toHaveAttribute("data-state", "success");

    // Formulário limpo após cadastro bem-sucedido
    await expect(raInput).toHaveValue("");
    await expect(nameInput).toHaveValue("");
    await expect(submitButton).toBeEnabled();

    // Lista atualizada na tabela sem recarregar a página
    const sameDocument = await page.evaluate(
      () => (window as unknown as { __sameDocument?: boolean }).__sameDocument,
    );
    expect(sameDocument).toBe(true);

    const rows = page.getByTestId("student-row");
    await expect(rows).toHaveCount(SEEDED_STUDENTS.length + 1);
    const createdRow = rows.filter({ hasText: "900001" });
    await expect(createdRow).toHaveCount(1);
    await expect(createdRow.locator("td")).toHaveText([
      "900001",
      "Mariana Costa",
    ]);
  });

  test("persistência mantém o aluno cadastrado após recarregar a página", async ({
    page,
  }) => {
    await page.getByLabel("RA", { exact: true }).fill("900002");
    await page.getByLabel("Nome", { exact: true }).fill("Lucas Almeida");

    const createResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "POST",
    );
    const listAfterCreatePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "GET",
    );

    await page.getByRole("button", { name: "Cadastrar aluno" }).click();

    expect((await createResponsePromise).status()).toBe(201);
    expect((await listAfterCreatePromise).status()).toBe(200);
    await expect(page.getByTestId("form-message")).toHaveText(
      "Aluno cadastrado com sucesso.",
    );

    const listAfterReloadPromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "GET",
    );
    await page.reload();
    expect((await listAfterReloadPromise).status()).toBe(200);
    await expect(page.locator("#students")).toHaveAttribute(
      "aria-busy",
      "false",
    );

    const rows = page.getByTestId("student-row");
    await expect(rows).toHaveCount(SEEDED_STUDENTS.length + 1);
    const persistedRow = rows.filter({ hasText: "900002" });
    await expect(persistedRow).toHaveCount(1);
    await expect(persistedRow.locator("td")).toHaveText([
      "900002",
      "Lucas Almeida",
    ]);
  });

  for (const scenario of [
    {
      label: "RA e Nome vazios",
      ra: "",
      name: "",
      invalidField: "ra" as const,
    },
    {
      label: "RA vazio e Nome preenchido",
      ra: "",
      name: "Daniela Ferreira",
      invalidField: "ra" as const,
    },
    {
      label: "RA preenchido e Nome vazio",
      ra: "900003",
      name: "",
      invalidField: "name" as const,
    },
  ]) {
    test(`campos obrigatórios impedem o cadastro quando ${scenario.label}`, async ({
      page,
    }) => {
      const postRequests: string[] = [];
      page.on("request", (request) => {
        if (
          new URL(request.url()).pathname === "/api/students" &&
          request.method() === "POST"
        ) {
          postRequests.push(request.url());
        }
      });

      const raInput = page.getByLabel("RA", { exact: true });
      const nameInput = page.getByLabel("Nome", { exact: true });

      await raInput.fill(scenario.ra);
      await nameInput.fill(scenario.name);
      await page.getByRole("button", { name: "Cadastrar aluno" }).click();

      const targetInput = scenario.invalidField === "ra" ? raInput : nameInput;
      const isValueMissing = await targetInput.evaluate(
        (el: HTMLInputElement) => el.validity.valueMissing && !el.validity.valid,
      );
      expect(isValueMissing).toBe(true);
      expect(postRequests).toHaveLength(0);
      await expect(page.getByTestId("student-row")).toHaveCount(
        SEEDED_STUDENTS.length,
      );
    });
  }

  for (const invalidRa of [
    { label: "negativo", value: "-1" },
    { label: "zero", value: "0" },
    { label: "decimal", value: "12.5" },
    { label: "maior que 2147483647", value: "2147483648" },
  ]) {
    test(`RA inválido (${invalidRa.label}: ${invalidRa.value}) é rejeitado`, async ({
      page,
    }) => {
      const postRequests: string[] = [];
      page.on("request", (request) => {
        if (
          new URL(request.url()).pathname === "/api/students" &&
          request.method() === "POST"
        ) {
          postRequests.push(request.url());
        }
      });

      const raInput = page.getByLabel("RA", { exact: true });
      const nameInput = page.getByLabel("Nome", { exact: true });

      await raInput.fill(invalidRa.value);
      await nameInput.fill("Gabriel Martins");
      await page.getByRole("button", { name: "Cadastrar aluno" }).click();

      const validityState = await raInput.evaluate((el: HTMLInputElement) => ({
        valid: el.validity.valid,
        message: el.validationMessage,
      }));
      expect(validityState.valid).toBe(false);
      expect(validityState.message.length).toBeGreaterThan(0);
      expect(postRequests).toHaveLength(0);
      await expect(page.getByTestId("student-row")).toHaveCount(
        SEEDED_STUDENTS.length,
      );
    });
  }

  for (const invalidName of [
    { label: "2 caracteres", value: "Ab" },
    { label: "apenas espaços", value: "   " },
    { label: "menos de 3 caracteres sem contar espaços nas extremidades", value: "  Ab  " },
  ]) {
    test(`Nome inválido (${invalidName.label}) é rejeitado`, async ({
      page,
    }) => {
      const postRequests: string[] = [];
      page.on("request", (request) => {
        if (
          new URL(request.url()).pathname === "/api/students" &&
          request.method() === "POST"
        ) {
          postRequests.push(request.url());
        }
      });

      const raInput = page.getByLabel("RA", { exact: true });
      const nameInput = page.getByLabel("Nome", { exact: true });

      await raInput.fill("900004");
      await nameInput.fill(invalidName.value);
      await page.getByRole("button", { name: "Cadastrar aluno" }).click();

      const validityState = await nameInput.evaluate(
        (el: HTMLInputElement) => ({
          valid: el.validity.valid,
          message: el.validationMessage,
        }),
      );
      expect(validityState.valid).toBe(false);
      expect(validityState.message.length).toBeGreaterThan(0);
      expect(postRequests).toHaveLength(0);
      await expect(page.getByTestId("student-row")).toHaveCount(
        SEEDED_STUDENTS.length,
      );
    });
  }

  test("RA duplicado rejeita cadastro, exibe mensagem de erro e mantém campos preenchidos", async ({
    page,
  }) => {
    const raInput = page.getByLabel("RA", { exact: true });
    const nameInput = page.getByLabel("Nome", { exact: true });

    await raInput.fill("258001");
    await nameInput.fill("Aluno Duplicado");

    const duplicateResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Cadastrar aluno" }).click();

    const duplicateResponse = await duplicateResponsePromise;
    expect(duplicateResponse.status()).toBe(409);
    expect(await duplicateResponse.json()).toMatchObject({
      statusCode: 409,
      message: "Já existe um estudante com este RA.",
    });

    const formMessage = page.getByTestId("form-message");
    await expect(formMessage).toHaveAttribute("data-state", "error");
    await expect(formMessage).toHaveText(
      "Não foi possível cadastrar o aluno. Já existe um estudante com este RA.",
    );

    // Campos permanecem preenchidos para correção
    await expect(raInput).toHaveValue("258001");
    await expect(nameInput).toHaveValue("Aluno Duplicado");
    await expect(
      page.getByRole("button", { name: "Cadastrar aluno" }),
    ).toBeEnabled();

    // Tabela não foi alterada
    await expect(page.getByTestId("student-row")).toHaveCount(
      SEEDED_STUDENTS.length,
    );
    await expect(
      page.getByTestId("student-row").filter({ hasText: "Aluno Duplicado" }),
    ).toHaveCount(0);
  });

  test('lista vazia exibe a mensagem "Nenhum aluno cadastrado." quando não existem alunos', async ({
    page,
  }) => {
    clearStudentsDatabase();

    const emptyListResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/students" &&
        response.request().method() === "GET",
    );

    await page.reload();

    const emptyListResponse = await emptyListResponsePromise;
    expect(emptyListResponse.status()).toBe(200);
    expect(await emptyListResponse.json()).toEqual([]);

    await expect(page.locator("#students")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.getByTestId("student-row")).toHaveCount(0);

    const listMessage = page.getByTestId("list-message");
    await expect(listMessage).toHaveText("Nenhum aluno cadastrado.");
    await expect(listMessage).toHaveAttribute("data-state", "success");
  });
});

