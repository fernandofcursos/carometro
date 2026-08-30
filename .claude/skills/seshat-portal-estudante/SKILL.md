# Skill: Portal do Estudante

## Conceito

O Portal do Estudante (`/portal`) é o espaço de autoatendimento para usuários com role `estudante`. Exibe dados pessoais, enturmação, disciplinas, ocorrências e documentos (carteira de estudante + cartão de liberação).

## Regras de Acesso por Idade

| Situação | Acesso |
|---|---|
| `isMaior = false` (< 18 anos) | Visualização somente — sem dar ciência em ocorrências |
| `isMaior = true` (≥ 18 anos) | Visualização + dar ciência + emitir carteira de estudante |

Verificação dupla: backend (autorização real) + frontend (UX/UI).

```typescript
// Backend: isMaiorDeIdade calcula com base em usuarios.data_nascimento
function isMaiorDeIdade(dataNascimento: string | null): boolean {
  if (!dataNascimento) return false;
  const hoje = new Date(), nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade >= 18;
}
```

## Menu (layout.tsx)

```typescript
const isEstudante = (user?.roles ?? []).includes("estudante");
const isAdmin = hasAny("usuarios:manage", "roles:manage");

// Visível para estudante OU admin (admin vê para ajuste/teste)
...(isEstudante || isAdmin ? [{
  label: "Meu Portal", icon: CreditCard, color: "#0ea5e9", bgColor: "#f0f9ff",
  items: [nav("Meu Perfil", "/portal", GraduationCap)],
}] : []),
```

## Endpoints

### GET /api/portal/me
Retorna dados próprios do estudante logado: `{ usuario, matriculas[], disciplinas[] }`. Inclui `isMaior` computado. Não requer permissão específica — dados do próprio usuário.

### GET /api/portal/ocorrencias
Ocorrências vinculadas via `estudantes.usuario_id`. Inclui `cienteEm` e `cientePorId`.

### POST /api/portal/ocorrencias/:id/ciencia
- 403 se `isMaiorDeIdade(usuario.dataNascimento) === false`
- 403 se ocorrência não pertence ao estudante
- 409 se já tem ciência

### GET /api/portal/carteira
Retorna a Carteira do Estudante ativa (`tipo = 'carteira'`) com token HMAC-SHA256.
O Cartão de Liberação Semestral (`tipo = 'cartao-semestral'`) é um documento separado, emitido manualmente pelo coordenador após pedido formal — nunca automático.

### GET /api/verificar/:token (público)
Verifica cartão sem autenticação. Retorna `{ valido, tipo, validade, nome, fotoUrl, emitidoEm }`.

## Token de Cartão (HMAC)

```typescript
function gerarTokenCartao(usuarioId: string, tipo: string, validade: string): string {
  const payload = JSON.stringify({ usuarioId, tipo, validade, ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
```

## QR Code (Frontend)

```tsx
import QRCode from "qrcode";

function QrCodeCanvas({ value, size = 160 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 2, errorCorrectionLevel: "M" });
  }, [value, size]);
  return <canvas ref={canvasRef} className="rounded" />;
}
// Uso: <QrCodeCanvas value={verUrl} size={100} />
```

## Carteira de Estudante

### Base Legal
- **Lei 12.989/2014** — meia-entrada em eventos culturais/esportivos
- **LGPD art. 6º** — finalidade e necessidade dos dados
- **ISO 27001 A.9.4** — controle de acesso ao documento
- **SEEDF** — normativos vigentes da Secretaria de Educação do DF

### Layout — CIE 2026 (horizontal, 560×320px)

Fundo lavanda `#eaecf8`, faixa azul escuro `#1a2f7a` de 14px na borda direita, curvas decorativas SVG roxas no canto inferior esquerdo.

**Cabeçalho:**
- **Logo esquerda:** Brasão GDF/SEEDF — embutida em base64 (`data:image/png;base64,...`)
- **Logo direita:** Logo CEP Escola Técnica de Santa Maria — embutida em base64
- Título "Carteira de / Identificação Estudantil" ao lado da logo esquerda

**Corpo (3 colunas):**
1. **Foto** — `me.usuario.fotoUrl`, 72×88px `objectFit: cover`; fallback `<UserCircle>`
2. **Campos** — Instituição, Curso, Turma, Turno, Matrícula, Data Nasc., Validade
3. **QR Code** — 76px + COD CIE (últimos 12 chars do token)

**Rodapé:**
- Esquerda: texto LGPD
- Direita: ano em 26px bold `#1a2f7a`

> **IMPORTANTE:** As logos são embutidas em base64 diretamente no componente `CarteiraEstudante`. Nunca usar URL externa — a carteira deve renderizar offline e em impressão.

### Dados obrigatórios na carteira
Foto (`fotoUrl`), Nome, Registro/Matrícula, Curso, Turno, Turma, Validade (semestre/ano), Instituição, QR Code de validação.

### Impressão
```tsx
<Button onClick={() => window.print()}>Imprimir carteira</Button>
```

## Emissão Automática na Enturmação

```typescript
// Em matriculas.ts — após INSERT na tabela matriculas:
try {
  await emitirCarteirasParaMatricula(usuarioId, matricula.id, body.ano, body.semestre);
} catch (cartErr) { console.error("[matriculas] falha ao emitir carteiras:", cartErr); }
```

`emitirCarteirasParaMatricula()` (em carteiras.ts) cria apenas:
- `tipo = 'carteira'` — carteira de estudante

Idempotente: verifica se já existe ativa antes de criar. Válido para qualquer idade.

> O `cartao-semestral` **não** é emitido automaticamente — requer pedido formal do estudante e emissão manual pelo coordenador via `POST /api/carteiras/emitir-liberacao/:usuarioId`.

## Ciclo de Vida

```
Enturmação → ativa → cancelada | revogada
(novo semestre → nova enturmação → novas carteiras ativas)
```

Gestão por coordenadores em `/carteiras` (`estudantes:manage`):
- `POST /api/carteiras/:id/cancelar` — extravio, fim de matrícula
- `POST /api/carteiras/:id/revogar` — fraude, uso indevido
- `POST /api/carteiras/renovar/:usuarioId` — renovação manual `{ano, semestre}`

## Cartão de Liberação

**Status: layout e infraestrutura implementados. Regras de liberação a definir.**
- `tipo = 'cartao-semestral'` emitido junto com carteira na enturmação
- Ciclo de vida idêntico à carteira (ativa/cancelada/revogada)
- Diário: a ser implementado em fase posterior

## OcorrenciasTab — padrão de ciência

```tsx
const cienciaMut = useMutation({
  mutationFn: (id: string) => postJson(`${BASE}/api/portal/ocorrencias/${id}/ciencia`),
  onSuccess: () => { toast({ title: "Ciência registrada." }); qc.invalidateQueries(...); },
  onError:   (e: Error) => toast({ variant: "destructive", title: e.message }),
  onSettled: () => setConfirming(null),
});
// AlertDialog de confirmação antes de chamar mutate()
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `artifacts/api-server/src/routes/portal-estudante.ts` | GET /me, /ocorrencias, ciência, /carteiras (lista próprias) |
| `artifacts/api-server/src/routes/carteiras.ts` | CRUD admin: listar, cancelar, revogar, renovar, verificação pública |
| `artifacts/api-server/src/routes/matriculas.ts` | Chama emitirCarteirasParaMatricula no POST |
| `artifacts/api-server/src/index.ts` | Registra `/api/portal`, `/api/carteiras`, `/api/verificar` |
| `lib/db/src/schema/carteiras.ts` | Schema da tabela carteiras |
| `scripts/migrate-carteiras.sql` | Migration idempotente para criar tabela |
| `artifacts/seshat/src/pages/portal/index.tsx` | UI do portal do estudante |
| `artifacts/seshat/src/pages/carteiras/index.tsx` | UI de gestão de carteiras (coordenador) |
| `artifacts/seshat/src/App.tsx` | Rotas `/portal` e `/carteiras` |
| `artifacts/seshat/src/components/layout.tsx` | "Meu Portal" (isEstudante) + "Carteiras e Cartões" (canManageCarteiras) |
| `artifacts/seshat/package.json` | Dependência `qrcode` + `@types/qrcode` |
