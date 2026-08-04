---
description: Spec do carômetro de Administração
---

# Carômetro de Administração

## Spec

Retorna os membros da equipe administrativa da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). Quando os membros estiverem vinculados a turno ou curso específico, o agrupamento é feito por turno/curso.

## Endpoint

`GET /api/carometro/administracao`

## Response Shape

```json
{
  "grupos": [
    {
      "turno": "Manhã",
      "curso": null,
      "membros": [
        {
          "id": 2,
          "nome": "João Santos",
          "foto_url": "https://example.com/fotos/joao-santos.jpg",
          "role": "secretaria"
        }
      ]
    }
  ]
}
```

## Regras de Negócio

- Roles incluídas: `secretaria`, `administracao`
- Exibe apenas: nome e foto
- Agrupamento por turno/curso quando o membro estiver vinculado a um turno ou curso específico
- Membros sem vínculo de turno/curso aparecem em grupo geral sem agrupamento
- Apenas usuários ativos devem ser retornados
