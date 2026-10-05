# Skill: SonarCloud / SonarQube

## Configuração inicial

1. Criar projeto em https://sonarcloud.io (organização `fernandofcursos`, projeto `carometro`)
2. Gerar token em https://sonarcloud.io/account/security
3. Adicionar secret no GitHub: `SONAR_TOKEN` em Settings → Secrets → Actions

## Gerar cobertura localmente

```bash
pnpm --filter @workspace/api-server run test -- --coverage
# lcov gerado em: artifacts/api-server/coverage/lcov.info
```

## Rodar análise local (opcional, requer sonar-scanner instalado)

```bash
sonar-scanner \
  -Dsonar.token=$SONAR_TOKEN
```

## Verificar Quality Gate

- Dashboard: https://sonarcloud.io/project/overview?id=fernandofcursos_carometro
- CI: job `sonar` no workflow ci.yml

## Armadilhas conhecidas

- `fetch-depth: 0` obrigatório no checkout para blame e histórico funcionar
- Coverage artifact deve ser gerado ANTES do job sonar (depende do job `backend`)
- `continue-on-error: true` no download do artifact evita que Sonar falhe se backend falhou
- SonarLint no VSCode precisa de Connected Mode para usar o Quality Gate do projeto
