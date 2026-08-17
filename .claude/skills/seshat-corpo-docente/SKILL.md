---
description: Spec do carômetro de Corpo Docente
---

# Carômetro de Corpo Docente

## Spec

Retorna os professores e educadores da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome e disciplinas). O agrupamento é sempre por turno/curso.

## Endpoint

`GET /api/carometro/corpo-docente`

## Response Shape

```json
{
  "grupos": [
    {
      "turno": "Manhã",
      "curso": "Ensino Médio",
      "membros": [
        {
          "id": 5,
          "nome": "Roberto Lima",
          "foto_url": "https://example.com/fotos/roberto-lima.jpg",
          "role": "professor",
          "disciplinas": ["Matemática", "Física"]
        },
        {
          "id": 6,
          "nome": "Fernanda Oliveira",
          "foto_url": "https://example.com/fotos/fernanda-oliveira.jpg",
          "role": "educador",
          "disciplinas": ["Língua Portuguesa"]
        }
      ]
    }
  ]
}
```

## Regras de Negócio

- Roles incluídas: `professor`, `educador`
- Exibe: nome, foto e disciplinas que ministram
- Agrupamento sempre por turno/curso (campo obrigatório para este grupo)
- Um mesmo professor pode aparecer em múltiplos grupos caso ministre aulas em mais de um turno/curso
- As disciplinas exibidas devem corresponder apenas às disciplinas do turno/curso do grupo em questão
- Apenas usuários ativos devem ser retornados

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.
