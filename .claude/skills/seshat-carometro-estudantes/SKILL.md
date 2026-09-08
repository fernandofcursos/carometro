# Skill: Carômetro Estudantes — Ocorrências

## Conceito

Página `/carometro` = galeria fotográfica de estudantes agrupados por turno → curso → turma.
Cada cartão abre um modal com histórico de ocorrências e, conforme perfil, formulário de registro.

## Menu

```
Grupo: "Carômetro"  (carometro:view)
└── "Estudantes" → /carometro
```

## Navegação — Clique na Foto

Clicar na foto (ou nome) do estudante **abre o modal** de ocorrências diretamente no carômetro. Não navega para `/estudantes/:id`.

```tsx
// EstudanteCardItem — toda a área da foto é um botão
<button type="button" onClick={() => onOcorrencia(estudante)}>
  <div className="aspect-[3/4] ...">
    <img ... />
  </div>
  <p>nome</p>
</button>
// Sem botão "Ocorrência" separado no card
```

O link `/estudantes/:id` (perfil completo) está disponível **dentro do modal** como "Ver perfil completo". A página de detalhes é preservada para uso em outras funcionalidades.

## Perfil Completo — `/estudantes/:id` (`detail.tsx`)

### Aba "Dados Cadastrais" — modo visualização

Exibe, nesta ordem:
1. Nome completo
2. Registro
3. Data de nascimento (com idade calculada)
4. E-mails (com tipo: próprio / responsável)
5. Turma + Turno
6. Curso
7. Observação
8. Data de cadastro
9. **Pai / Responsável** — seção exibida apenas quando `responsaveis.length > 0`; mostra nome, código de acesso e email de cada responsável vinculado

### Aba "Dados Cadastrais" — modo edição

Campos editáveis, na mesma ordem, acrescidos de:
- **Pai / Responsável (opcional)** — componente `ResponsaveisSelector`:
  - Busca debounced 300ms → `GET /api/usuarios/responsaveis?q=`
  - Lista com checkboxes; selecionados exibidos como pills com botão X
  - Pré-carregado com os responsáveis já vinculados ao abrir o modo edição
  - Salvo via `PUT /api/estudantes/:id` com `responsavelIds: string[]`
  - Array vazio limpa todos os vínculos

### API usada pela página

| Ação | Endpoint |
|---|---|
| Carregar perfil | `GET /api/estudantes/:id` |
| Salvar edição | `PUT /api/estudantes/:id` (inclui `responsavelIds`) |
| Buscar responsáveis | `GET /api/usuarios/responsaveis?q=` |
| Upload de foto | `POST /api/estudantes/:id/foto` |

### Criptografia de email — armadilha

`GET /api/estudantes/:id` descriptografa o email dos responsáveis usando `SESSION_SECRET`.  
**Nunca usar** `ENCRYPTION_KEY` para emails — causa email vazio no retorno da API.

## Padrão Visual — Cards Fotográficos (3×4)

Todos os carômetros usam proporção **3:4** (retrato) para maximizar fotos por linha.

### Grade de estudantes (`seshat.tsx`)

```tsx
// Grade: muitas colunas, gap pequeno
<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
  <EstudanteCardItem ... />
</div>

// Card
<div className="aspect-[3/4] ...">          {/* proporção 3:4 */}
  <img className="w-full h-full object-cover" />
  {/* sem foto: Avatar w-10 h-10 */}
</div>
<div className="px-1 pt-1 pb-0.5">
  <p className="text-[10px] font-semibold truncate">nome</p>
  <p className="text-[9px] text-muted-foreground truncate">registro</p>
</div>
// Botão ocorrência: h-5 text-[9px]
```

### Cards de equipe (`seshat-grupo.tsx`)

```tsx
// Tamanho: small=w-16 h-[85px] | normal=w-20 h-[107px]  (proporção 3:4)
// Avatar sem foto: small=w-9 h-9 | normal=w-11 h-11
// Grade: flex flex-wrap gap-2

<div className={`flex flex-col items-center gap-1 ${small ? "w-16" : "w-20"}`}>
  <div className={`... ${small ? "w-16 h-[85px]" : "w-20 h-[107px]"}`}>
    <img className="w-full h-full object-cover" />
  </div>
  <p className={small ? "text-[9px]" : "text-[10px]"}>nome</p>
</div>
```

**Regra:** nunca usar `w-24`/`w-28`/`h-32`/`h-36` nos cards de carômetro — esses tamanhos foram descontinuados. Sempre usar as medidas acima para manter consistência e densidade visual.

## Agrupamento (frontend)

```typescript
// rawGroups vem da API como CarometroGroup[]
// Regrupar: turnoNome → cursoNome → CarometroGroup[]
const byTurno: Record<string, Record<string, CarometroGroup[]>> = {};
for (const g of groups) { byTurno[g.turnoNome][g.cursoNome].push(g); }
```

## Perfil Completo do Estudante — detail.tsx (`/estudantes/:id`)

A página de detalhe exibe e edita `dataNascimento` do estudante.

### Estado e reset
```tsx
const [dataNascimento, setDataNascimento] = useState("");
// em resetForm:
setDataNascimento((e as { dataNascimento?: string | null }).dataNascimento ?? "");
```

### Formulário de edição
```tsx
<div className="space-y-2">
  <Label>Data de Nascimento</Label>
  <Input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
  {dataNascimento && (() => {
    const nasc = new Date(dataNascimento); const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return <p className="text-xs text-muted-foreground">{idade} anos</p>;
  })()}
</div>
```

### Mutação (handleSaveData)
```tsx
updateEstudante.mutate({ id, data: { nome, registro, dataNascimento: dataNascimento || null, ... } })
```

### Visualização (read-only)
Exibe data por extenso + idade: `"DD de mês de AAAA (X anos)"`.

---

## API do Carômetro — GET /api/carometro

Retorna por turma:
```typescript
{
  turmaId, turmaSigla, turmaDescricao,
  cursoId, cursoNome,
  turnoId, turnoNome,
  estudantes: [{ id, nome, registro, dataNascimento, fotoUrl }]
}
```

`fotoUrl` é uma URL de endpoint — **não data URL inline**:
- `/api/fotos/:fotoId` quando `foto_id` preenchido na tabela `estudantes`
- `/api/estudantes/:id/foto` como fallback para dados legados (ainda sem `foto_id`)
- `null` para estudantes sem foto

A descriptografia ocorre sob demanda por request de foto, não em lote no carômetro. O browser faz cache `private, max-age=86400` automaticamente.

JOIN via `turmaTurnosTable` (não mais `turmasTable.turnoId`):
```ts
.leftJoin(turmaTurnosTable, eq(turmaTurnosTable.turmaId, estudantesTable.turmaId))
.leftJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))
```

Deduplica estudantes em Map por `estudante.id` (turma multi-turno gera N linhas).

## Ocorrências — Schema

### `ocorrencias` (colunas adicionadas)

| Coluna | Tipo |
|---|---|
| `turno_id` | uuid FK turnos NULL |
| `ciente_em` | timestamptz NULL |
| `ciente_por_id` | uuid FK usuarios NULL |
| `notificacao_pais_enviada_em` | timestamptz NULL |
| `observacao` | varchar(300) — era text |

### `estudantes` (coluna adicionada)

| Coluna | Tipo |
|---|---|
| `data_nascimento` | date NULL |

## Endpoints de Ocorrências

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/api/ocorrencias?estudanteId=` | `ocorrencias:view` | Lista com joins completos |
| GET | `/api/ocorrencias/estudante/:id` | requireAuth | Lista resumida (pais/estudantes) |
| POST | `/api/ocorrencias` | `ocorrencias:create` | Cria; aceita `turnoId`, `enviarEmailPais` |
| PUT | `/api/ocorrencias/:id` | `ocorrencias:create` | Edita |
| DELETE | `/api/ocorrencias/:id` | `ocorrencias:create` | Soft delete |
| POST | `/api/ocorrencias/:id/ciente` | requireAuth | Marca ciência (409 se já registrada) |
| POST | `/api/ocorrencias/:id/notificar-pais` | `ocorrencias:create` | Envia e-mail aos responsáveis |

## Formulário — Campos

| Campo | Comportamento |
|---|---|
| Data de Registro | Exibição read-only = data do servidor (criadoEm) |
| Data da Ocorrência | Input date, default hoje, max hoje |
| Disciplina — Turno | Select com opções `${d.disciplinaNome} — ${d.turnoNome}` (user.disciplinas) |
| Tipo de Ocorrência | Select de tipos_ocorrencias ativos |
| Descrição | Textarea maxLength=300; contador; cor âmbar > 280 |
| Notificar responsáveis | Checkbox visível APENAS se estudante for menor de idade (< 18 anos) |

## Menor de Idade

```typescript
function isMenor(dataNascimento: string | null): boolean {
  if (!dataNascimento) return false;
  const nasc = new Date(dataNascimento);
  // ... calcula idade
  return idade < 18;
}
```

Exibe badge "Menor" no cartão; ativa checkbox de notificação no formulário.

## Ciência (Pai/Responsável)

Frontend:
```typescript
const isPaiResp = useHasRole("pai_responsavel");
// Se isPaiResp && !ocorrencia.cienteEm → exibe botão "Marcar como Ciente"
// POST /api/ocorrencias/:id/ciente
// Após: badge "Ciente" com data; botão desaparece
```

## Visibilidade do Botão por Role

| Condição | Botão |
|---|---|
| `ocorrencias:create` | "Ocorrência" (âmbar) |
| `pai_responsavel` ou `estudante` | "Ver ocorrências" (neutro) |
| Demais | Sem botão |

## Mailer — enviarEmailOcorrencia()

```typescript
await enviarEmailOcorrencia({
  para, estudanteNome, tipoOcorrencia,
  dataOcorrencia, turnoNome?, disciplinaNome?, observacao?
});
```

## Vínculo Enturmação → Carômetro

`POST /api/matriculas` — após criar a matrícula, sincroniza `estudantes`:

```typescript
// Busca usuário: nome + dataNascimento
// Tenta encontrar estudante por usuarioId → atualiza turmaId
// Senão, tenta por registro → vincula usuarioId (se sem vínculo)
// Senão → INSERT estudantes (nome, registro, turmaId, usuarioId, dataNascimento)
// Falha é tolerada (log + continua)
```

Campo adicionado: `estudantes.usuario_id uuid FK usuarios NULL UNIQUE`

## Menor de Idade — Ciência e Notificação

```typescript
// POST /api/ocorrencias — auto-notifica se menor de idade OU enviarEmailPais=true
const menor = await getEstudanteMenorDeIdade(data.estudanteId);
if (menor || enviarEmailPais) await notificarPais(...);

// POST /api/ocorrencias/:id/ciente — bloqueia estudante menor
const isEstudante = await usuarioTemRole(req.usuarioId, "estudante");
if (isEstudante && menor) return res.status(403).json({ error: "..." });
```

Frontend:
```typescript
// OcorrenciaItem — botão visível somente se:
const podeMarcarCiente = isPaiResponsavel || (isEstudante && !estudanteMenor);
// Para menor: exibe aviso "A ciência deve ser registrada pelo responsável"
```

## Migration

```bash
psql $DATABASE_URL -f scripts/migrate-estudantes-v2.sql
psql $DATABASE_URL -f scripts/migrate-ocorrencias-v2.sql
pnpm --filter @workspace/db run push-force
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/ocorrencias.ts` | Novas colunas |
| `lib/db/src/schema/estudantes.ts` | dataNascimento |
| `scripts/migrate-ocorrencias-v2.sql` | Migration idempotente |
| `artifacts/api-server/src/routes/ocorrencias.ts` | CRUD + ciente + notificar |
| `artifacts/api-server/src/routes/seshat.ts` | GET /api/carometro com join correto |
| `artifacts/api-server/src/lib/mailer.ts` | enviarEmailOcorrencia |
| `artifacts/seshat/src/pages/seshat.tsx` | Página completa |
| `.specs/features/carometro-estudantes.md` | Spec completa |

---

## Carômetros de Grupo (Usuários por Role)

Páginas: `/carometro/equipe-gestora`, `/administracao`, `/equipe-pedagogica`, `/corpo-docente`, `/apoio-operacional`, `/carometro/usuarios`

**Componente:** `seshat-grupo.tsx` → `CarometroGrupoPage`

**Contrato da API:** retorna `UsuarioCard[]` (array plano).

```typescript
// CORRETO — o frontend faz Array.isArray(data)
res.json(await getUsuariosPorRoles(["equipe_gestora"]));

// ERRADO — Array.isArray({ sections: [] }) === false → lista vazia na UI
res.json({ sections: await getUsuariosPorRoles(...) });
```

**Email:** campo `emailEncrypted` no banco — descriptografar com `SESSION_SECRET` antes de retornar.

**Agrupamento:** feito no frontend via `ofertas[].turnoId + cursoId`. A API retorna lista plana; o `buildGroups()` em `seshat-grupo.tsx` monta a hierarquia turno → curso.
