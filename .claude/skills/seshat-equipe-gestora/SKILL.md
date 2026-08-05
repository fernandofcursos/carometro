---
description: Spec do carômetro de Equipe Gestora
---

# Carômetro de Equipe Gestora

## Spec

Retorna os membros da equipe gestora da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). Quando os membros estiverem vinculados a turno ou curso específico, o agrupamento é feito por turno/curso.

## Endpoint

`GET /api/carometro/equipe-gestora`

## Response Shape

```json
{
  "grupos": [
    {
      "turno": "Manhã",
      "curso": "Ensino Médio",
      "membros": [
        {
          "id": 1,
          "nome": "Maria Silva",
          "foto_url": "https://example.com/fotos/maria-silva.jpg",
          "role": "equipe_gestora"
        }
      ]
    }
  ]
}
```

## Regras de Negócio

- Roles incluídas: `equipe_gestora`
- Exibe apenas: nome e foto
- Agrupamento por turno/curso quando o membro estiver vinculado a um turno ou curso específico
- Membros sem vínculo de turno/curso aparecem em grupo geral sem agrupamento
- Apenas usuários ativos devem ser retornados
