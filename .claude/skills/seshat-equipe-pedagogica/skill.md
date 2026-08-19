# Carômetro de Equipe Pedagógica

## Spec

Retorna os membros da equipe pedagógica da instituição em formato de carômetro (grade de fotos com nome). O agrupamento é feito por turno/curso quando o membro estiver vinculado a ofertas.

## Endpoint

`GET /api/carometro/equipe-pedagogica`

Requer permissão `carometro:view`. Retorna `UsuarioCard[]` — array plano.

```typescript
type UsuarioCard = {
  id: string;
  nome: string | null;
  email: string;
  fotoUrl: string | null;
  codigoAcesso: string;
  roles: { id: string; nome: string }[];
  ofertas: {
    ofertaId: string; disciplinaId: string; disciplinaNome: string;
    cursoId: string; cursoNome: string; turnoId: string; turnoNome: string;
  }[];
  cursosCoordenados: { id: string; nome: string }[];
};
```

## Roles incluídas

`coordenador`, `soe`, `aee`, `supervisao_pedagogica`

## Regras de Visualização

- **Disciplinas NÃO são exibidas** nos cards da Equipe Pedagógica (`showDisciplinas={false}`)
- **Coordenador**: exibe abaixo do nome "Coord.: <cursos>" em violeta — obtido de `cursosCoordenados`
- Agrupamento por turno/curso (via `ofertas`) quando vinculados; sem vínculo → grupo "Sem turno"
- Apenas usuários ativos retornados

## Implementação Frontend

Componente em `artifacts/seshat/src/pages/seshat-grupo.tsx`:

```tsx
export function CarometroEquipePedagogica() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/equipe-pedagogica"
      titulo="Carômetro — Equipe Pedagógica"
      descricao="Membros da equipe pedagógica agrupados por turno e curso."
      showDisciplinas={false}
    />
  );
}
```

O prop `showDisciplinas={false}` suprime a linha de disciplinas em `UserPhotoCard`. A linha de coordenações (`cursosCoordenados`) é independente e sempre exibida quando `roles` contém `coordenador`.

## Padrão Visual dos Cards

Cards 3:4 (retrato): `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28`.
