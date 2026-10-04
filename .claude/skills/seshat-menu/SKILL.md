# Skill: Menu lateral — Grupos e Permissões

## Arquivo

`artifacts/seshat/src/components/layout.tsx`

## Regra geral

Cada item de menu controla sua própria visibilidade via `hasAny("<recurso>:<acao>")`.
Nunca usar um flag genérico compartilhado para esconder/mostrar itens individuais —
cada item tem sua permissão granular.

## Variáveis de permissão (ordem de declaração)

```typescript
// Roles especiais (devem vir primeiro — usadas em outras vars)
const isEstudante      = (user?.roles ?? []).includes("estudante");
const isPaiResponsavel = (user?.roles ?? []).includes("pai_responsavel");
const isAdmin          = hasAny("usuarios:manage", "roles:manage");

// Grupo Modulação — permissões granulares
const canManageCursos      = hasAny("cursos:manage");
const canManageTurnos      = hasAny("turnos:manage");
const canManageTurmas      = hasAny("turmas:manage");
const canManageDisciplinas = hasAny("disciplinas:manage");
const canManageHorarios    = hasAny("horarios:manage");
const canManageCalendario  = hasAny("calendario:manage");
// Grupo Modulação aparece se ao menos um dos três base tem permissão:
const canManageGeral = canManageCursos || canManageTurnos || canManageTurmas;

// Outros grupos
const canImport             = hasAny("import:execute");
const canManageUsuarios     = hasAny("usuarios:manage");
const canManageRoles        = hasAny("roles:manage");
const canViewCarometro      = hasAny("carometro:view") && !isEstudante && !isPaiResponsavel;
const canViewEstudantes     = hasAny("estudantes:view", "estudantes:manage");
const canManageEstudantes   = hasAny("estudantes:manage");
const canManageCarteiras    = hasAny("estudantes:manage");
const canViewOcorrencias    = hasAny("ocorrencias:view", "ocorrencias:create");
const canManageTiposOcorrencias = hasAny("tipos-ocorrencias:manage");
const isProfessor           = (user?.roles ?? []).includes("professor");
const canManageAvisos       = hasAny("avisos:manage");
const canCreateRequerimentos   = hasAny("requerimentos:create");
const canManageRequerimentos   = hasAny("requerimentos:manage");
const canManageTiposRequerimentos = hasAny("requerimentos:manage"); // mesma permissão
```

## Item fixo: Início

Acima de todos os grupos, logo abaixo do `SidebarHeader`, existe um link fixo para `/` disponível para **todos os perfis** (sem guard de permissão):

```tsx
<Link href="/">
  <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-md mb-2 text-sm font-medium ...",
    location === "/" ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted/60",
  )}>
    <Home className="w-4 h-4" />
    <span>Início</span>
  </div>
</Link>
```

- Ícone: `Home` (lucide-react)
- Destino: `/` (Dashboard)
- Ativo: quando `location === "/"`
- Visível: sempre, independente de perfil ou permissão

## Estrutura de grupos do menu

### Carômetro
- Permissão: `canViewCarometro` = `carometro:view` AND NOT (estudante | pai_responsavel)
- Itens: Carômetro geral + subgrupos por cargo

### Administração
- Permissão: `canManageUsuarios` OR `canManageRoles`
- Itens: Roles & Permissões (`roles:manage`), Usuários (`usuarios:manage`), Diagnóstico de E-mail (`usuarios:manage`)

### Modulação
- Permissão de grupo: `canManageGeral` = `cursos:manage` | `turnos:manage` | `turmas:manage`
- Itens (cada um com permissão própria):

| Item | Permissão |
|---|---|
| Cursos | `cursos:manage` |
| Turnos | `turnos:manage` |
| Turmas | `turmas:manage` |
| Unid. Curriculares | `disciplinas:manage` |
| Quadro de Horários | `horarios:manage` |
| Calendário Escolar | `calendario:manage` |

### Enturmação
- Permissão: `estudantes:manage`
- Itens: Estudantes, Carteiras e Cartões

### Ocorrências
- Permissão: `ocorrencias:view` | `ocorrencias:create` | `tipos-ocorrencias:manage`
- Itens: Tipos de Ocorrência, Textos Padrão, Relatório de Ocorrências

### Meu Portal
- Permissão: `isEstudante`
- Itens: Dashboard (`/portal`), Cartão de Liberação, Requerimentos (`canCreateRequerimentos`)

### Portal do Professor
- Permissão: `isProfessor`
- Itens: Dashboard Docente (`/portal-professor`)

### Equipe Gestora
- Permissão: `hasAny("equipe-gestora:view")` ou similar
- Itens: Dashboard Equipe Gestora

### Portal da Secretaria
- Permissão: `hasAny("secretaria:view")` ou permissão específica
- Itens: Dashboard Secretaria

### Portal do Coordenador
- Permissão: `hasAny("coordenador:view")` ou permissão específica
- Itens: Dashboard Coordenador

### Portal do Responsável
- Permissão: `isPaiResponsavel`
- Itens: Dashboard Responsável (`/portal-responsavel`)

### Requerimentos
- Permissão: `canManageRequerimentos`
- Itens: Análise de Requerimentos (`/requerimentos/analise`), Tipos de Requerimento (`canManageTiposRequerimentos`)

### EEAA
- Permissão: `hasAny("eeaa:view")` ou permissão específica
- Itens: EEAA

### SOE
- Permissão: `hasAny("soe:view")` ou permissão específica
- Itens: SOE

### Sala de Recursos / Adequações SR
- Permissão: `hasAny("sala-recursos:view")` ou permissão específica
- Itens: Sala de Recursos, Adequações

### Avisos e Informes
- Permissão: `canManageAvisos`
- Itens: Avisos (`/avisos`), Informes (`/informes`), Tipos de Aviso (`/tipos-avisos`)

### Manutenção / Importação
- Permissão: `canImport`
- Itens: importações de cursos, disciplinas, estudantes, professores, turmas

### Privacidade & Segurança
- Sem permissão de grupo (visível para todos autenticados)
- Itens: LGPD, Acessos & Permissões, Log de Auditoria, ISO 27001

## Migration de permissões

`scripts/migrate-permissoes-modulacao.sql` — insere todas as permissões do grupo Modulação:

```sql
INSERT INTO permissoes (recurso, acao)
VALUES
  ('cursos',     'manage'),
  ('turnos',     'manage'),
  ('turmas',     'manage'),
  ('disciplinas','manage'),
  ('horarios',   'manage'),
  ('calendario', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;
```

## Ícones usados (lucide-react)

| Item | Ícone |
|---|---|
| Modulação (grupo) | `Layers` |
| Cursos | `BookOpen` |
| Turnos | `Clock` |
| Turmas | `Building` |
| Disciplinas | `GraduationCap` |
| Quadro de Horários | `CalendarDays` |
| Calendário Escolar | `CalendarRange` |

## Anti-padrões

- ❌ `nav("Cursos", "/cursos", BookOpen)` sem guard — sempre visível independente de permissão
- ❌ `canManageGeral` como único guard para itens individuais dentro do grupo
- ✅ Cada item: `...(canManageCursos ? [nav(...)] : [])`
