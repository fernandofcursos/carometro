# Spec: SonarCloud / SonarQube

## Objetivo

Análise estática de código e cobertura de testes integrada ao CI/CD via SonarCloud (SaaS).

## Configuração

### sonar-project.properties (raiz do repo)

```
sonar.projectKey=fernandofcursos_carometro
sonar.organization=fernandofcursos
sonar.projectName=Seshat
sonar.sources=artifacts/seshat/src,artifacts/api-server/src,lib/db/src
sonar.tests=artifacts/api-server/src/tests
sonar.javascript.lcov.reportPaths=artifacts/api-server/coverage/lcov.info
```

### Secret GitHub

`SONAR_TOKEN` deve ser configurado em:
`https://github.com/fernandofcursos/carometro/settings/secrets/actions`

O token é obtido em: `https://sonarcloud.io/account/security`

### Pipeline CI/CD (.github/workflows/ci.yml)

- Job `backend` roda testes com `--coverage` → gera `artifacts/api-server/coverage/lcov.info`
- Job `backend` faz upload do `coverage-lcov` artifact
- Job `sonar` depende de `[backend, frontend]`, baixa o artifact e roda `SonarSource/sonarqube-scan-action@v5`
- `if: always() && !cancelled()` garante que Sonar roda mesmo se um job falhar

### SonarLint no VS Code

Extensão `sonarsource.sonarlint-vscode` instalada no devcontainer.
Conectar ao SonarCloud em: View → SonarLint → Connect to SonarCloud.

## Cobertura de Testes

- Gerada por Vitest com `--coverage` (provider `@vitest/coverage-v8`)
- Formato: lcov → `artifacts/api-server/coverage/lcov.info`
- Quality Gate padrão SonarCloud: cobertura mínima 50% em código novo

## Exclusões

- `node_modules`, `dist`, `migrations`, `scripts`
- Arquivos `*.test.ts` e `*.spec.ts` (são testes, não código de produção)
- `.pnpm-store`
