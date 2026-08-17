---
description: Spec do carômetro de Apoio e Operacional
---

# Carômetro de Apoio e Operacional

## Spec

Retorna os membros da equipe de apoio e operacional da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). Quando os membros estiverem vinculados a turno ou curso específico, o agrupamento é feito por turno/curso.

## Endpoint

`GET /api/carometro/apoio-operacional`

## Response Shape

```json
{
  "grupos": [
    {
      "turno": "Manhã",
      "curso": null,
      "membros": [
        {
          "id": 7,
          "nome": "Paulo Rodrigues",
          "foto_url": "https://example.com/fotos/paulo-rodrigues.jpg",
          "role": "inspetor"
        },
        {
          "id": 8,
          "nome": "Lucia Ferreira",
          "foto_url": "https://example.com/fotos/lucia-ferreira.jpg",
          "role": "merendeira"
        }
      ]
    }
  ]
}
```

## Regras de Negócio

- Roles incluídas: `inspetor`, `limpeza`, `portaria`, `merendeira`, `seguranca`
- Exibe apenas: nome e foto
- Agrupamento por turno/curso quando o membro estiver vinculado a um turno ou curso específico
- Membros sem vínculo de turno/curso aparecem em grupo geral sem agrupamento
- Apenas usuários ativos devem ser retornados

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.
