---
description: Spec do carômetro de Usuários (pais, responsáveis e estudantes)
---

# Carômetro de Usuários

## Spec

Retorna pais/responsáveis e estudantes da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). Responsáveis e estudantes são exibidos em seções separadas. Estudantes são agrupados por turno/curso; responsáveis são exibidos com os estudantes aos quais estão vinculados.

## Endpoint

`GET /api/carometro/usuarios`

## Response Shape

```json
{
  "responsaveis": {
    "titulo": "Pais e Responsáveis",
    "membros": [
      {
        "id": 9,
        "nome": "Marcos Almeida",
        "foto_url": "https://example.com/fotos/marcos-almeida.jpg",
        "role": "pai_responsavel",
        "vinculados": [
          {
            "id": 10,
            "nome": "Gabriel Almeida",
            "turno": "Manhã",
            "curso": "Ensino Médio - 1º Ano"
          }
        ]
      }
    ]
  },
  "estudantes": {
    "titulo": "Estudantes",
    "grupos": [
      {
        "turno": "Manhã",
        "curso": "Ensino Médio - 1º Ano",
        "membros": [
          {
            "id": 10,
            "nome": "Gabriel Almeida",
            "foto_url": "https://example.com/fotos/gabriel-almeida.jpg",
            "role": "estudante",
            "turno": "Manhã",
            "curso": "Ensino Médio - 1º Ano"
          }
        ]
      }
    ]
  }
}
```

## Regras de Negócio

- Roles incluídas: `pai_responsavel`, `estudante`
- Responsáveis e estudantes aparecem em seções separadas na resposta
- Responsáveis (`pai_responsavel`): exibe nome, foto e lista de estudantes vinculados (com turno/curso de cada um)
- Estudantes (`estudante`): exibe nome e foto; agrupados por turno/curso
- Um responsável pode estar vinculado a mais de um estudante
- Um estudante pode ter mais de um responsável vinculado
- Apenas usuários ativos devem ser retornados
