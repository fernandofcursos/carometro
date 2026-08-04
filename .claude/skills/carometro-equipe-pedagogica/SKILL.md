---
description: Spec do carômetro de Equipe Pedagógica
---

# Carômetro de Equipe Pedagógica

## Spec

Retorna os membros da equipe pedagógica da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). Quando os membros estiverem vinculados a turno ou curso específico, o agrupamento é feito por turno/curso.

## Endpoint

`GET /api/carometro/equipe-pedagogica`

## Response Shape

```json
{
  "grupos": [
    {
      "turno": "Tarde",
      "curso": "Ensino Fundamental",
      "membros": [
        {
          "id": 3,
          "nome": "Ana Costa",
          "foto_url": "https://example.com/fotos/ana-costa.jpg",
          "role": "coordenador"
        },
        {
          "id": 4,
          "nome": "Carlos Pereira",
          "foto_url": "https://example.com/fotos/carlos-pereira.jpg",
          "role": "supervisao_pedagogica"
        }
      ]
    }
  ]
}
```

## Regras de Negócio

- Roles incluídas: `coordenador`, `soe`, `aee`, `supervisao_pedagogica`
- Exibe apenas: nome e foto
- Agrupamento por turno/curso quando o membro estiver vinculado a um turno ou curso específico
- Membros sem vínculo de turno/curso aparecem em grupo geral sem agrupamento
- Apenas usuários ativos devem ser retornados
