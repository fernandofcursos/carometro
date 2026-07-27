// Erro de domínio tipado — tratado pelo handler global em app.ts
// Usar para validações de negócio e pré-condições que devem retornar HTTP 4xx
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
