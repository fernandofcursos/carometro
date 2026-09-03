import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, { credentials: "include", ...init });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw { status: r.status, data: e }; }
  return r.json();
}
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText, Plus, CheckCircle2, XCircle, Clock, Pen, AlertCircle,
  ChevronRight, User, GraduationCap, Loader2,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Assunto { id: string; nome: string; descricao: string | null; requerMotivos: boolean; ordem: number }
interface Tipo    { id: string; nome: string; assuntos: Assunto[] }
interface EstudanteInfo {
  id: string; nome: string; dataNascimento: string | null;
  usuarioId?: string | null;
  cursoNome?: string | null;
  turmaSigla?: string | null;
  turnos?: string[]; // apenas os turnos das matrículas ativas
}
interface ElegibilidadeResp {
  elegivel: boolean; motivo?: string;
  tipoRequerente?: "estudante" | "pai_responsavel";
  estudantes?: EstudanteInfo[];
}
interface Assinatura { papel: string; metodo: string; assinadoEm: string; nome: string | null }
interface Requerimento {
  id: string; numero: string; status: string; assuntoNome: string; tipoNome: string;
  estudanteNome: string; requerenteNome: string | null; criadoEm: string;
  exposicaoMotivos: string | null; parecer: string | null; analisadoEm: string | null;
  assinaturas: Assinatura[];
}

// ── Utilitários ───────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, { label: string; variant: "default"|"secondary"|"destructive"|"outline" }> = {
  pendente:    { label: "Pendente",    variant: "secondary" },
  em_analise:  { label: "Em Análise",  variant: "default"   },
  deferido:    { label: "Deferido",    variant: "outline"   },
  indeferido:  { label: "Indeferido",  variant: "destructive" },
};

function contarPalavras(t: string) { return t.trim().split(/\s+/).filter(Boolean).length; }

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant as any}>{s.label}</Badge>;
}

// ── Componente de Assinatura ──────────────────────────────────────────────────
function AssinarModal({
  requerimentoId, papel, onClose,
}: { requerimentoId: string; papel: "requerente" | "analisador"; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [metodo, setMetodo] = useState<"senha" | "gov_br" | "certificado_digital">("senha");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const endpoint = papel === "requerente"
    ? `/api/requerimentos/${requerimentoId}/assinar`
    : `/api/requerimentos/${requerimentoId}/assinar-analise`;

  async function handleAssinar() {
    if (metodo === "senha" && !senha) {
      toast({ title: "Informe a senha para assinar.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo, senha: metodo === "senha" ? senha : undefined }),
      });
      toast({ title: "Assinatura registrada com sucesso." });
      qc.invalidateQueries({ queryKey: ["requerimentos"] });
      onClose();
    } catch (err: any) {
      toast({ title: err?.data?.error ?? "Erro ao assinar.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pen className="h-5 w-5" /> Assinatura Eletrônica
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Ao assinar, você declara ciência do conteúdo deste requerimento e confirma sua autenticidade.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Método de assinatura</Label>
            <RadioGroup value={metodo} onValueChange={(v) => setMetodo(v as any)} className="space-y-2">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="senha" />
                <div>
                  <p className="text-sm font-medium">Senha do sistema</p>
                  <p className="text-xs text-muted-foreground">Use sua senha de acesso ao Seshat</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 opacity-60">
                <RadioGroupItem value="gov_br" disabled />
                <div>
                  <p className="text-sm font-medium">Gov.br</p>
                  <p className="text-xs text-muted-foreground">Em breve — requer integração com portal gov.br</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 opacity-60">
                <RadioGroupItem value="certificado_digital" disabled />
                <div>
                  <p className="text-sm font-medium">Certificado Digital</p>
                  <p className="text-xs text-muted-foreground">Em breve — requer certificado ICP-Brasil</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {metodo === "senha" && (
            <div className="space-y-1">
              <Label htmlFor="senha-assinatura">Senha</Label>
              <Input
                id="senha-assinatura"
                type="password"
                placeholder="Digite sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAssinar()}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAssinar} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Pen className="h-4 w-4 mr-2" /> Assinar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de Detalhe / Impressão ──────────────────────────────────────────────
function DetalheModal({ req, onClose, onAssinar }: {
  req: Requerimento; onClose: () => void; onAssinar: () => void;
}) {
  const jaAssinou = req.assinaturas.some((a) => a.papel === "requerente");
  const dataFormatada = new Date(req.criadoEm).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Requerimento {req.numero}
          </DialogTitle>
        </DialogHeader>

        {/* Formulário visual fiel ao modelo físico */}
        <div className="space-y-6 py-2 text-sm">
          {/* Cabeçalho institucional */}
          <div className="text-center border-b pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Secretaria Escolar
            </p>
            <h2 className="text-lg font-bold uppercase mt-1">Requerimento Geral</h2>
            <p className="text-xs text-muted-foreground mt-1">{req.numero}</p>
          </div>

          {/* Dados do Aluno */}
          <div>
            <h3 className="font-semibold uppercase text-xs tracking-wider text-muted-foreground mb-3">
              Dados do Aluno
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="font-medium">{req.estudanteNome}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Curso</p>
                <p className="font-medium">{(req as any).cursoNome ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Turno</p>
                <p className="font-medium">{(req as any).turnoNome ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Requerente</p>
                <p className="font-medium">{req.requerenteNome ?? "—"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Assunto */}
          <div>
            <h3 className="font-semibold uppercase text-xs tracking-wider text-muted-foreground mb-3">
              Venho por meio deste requerer a Vossa Senhoria
            </h3>
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="font-semibold">{req.assuntoNome}</p>
                <p className="text-xs text-muted-foreground">{req.tipoNome}</p>
              </div>
            </div>
          </div>

          {/* Exposição de Motivos */}
          {req.exposicaoMotivos && (
            <div>
              <h3 className="font-semibold uppercase text-xs tracking-wider text-muted-foreground mb-2">
                Exposição de Motivos
              </h3>
              <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">
                {req.exposicaoMotivos}
              </p>
            </div>
          )}

          {/* Observação legal */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Atenção:</strong> Assinar este requerimento não garantirá o deferimento da petição.
              A resposta será dada no prazo máximo de 05 dias úteis.
              É de inteira responsabilidade do aluno/responsável comparecer à Secretaria Escolar para obter o resultado.
            </AlertDescription>
          </Alert>

          {/* Local e data */}
          <p className="text-xs text-muted-foreground text-right">
            Santa Maria – DF, {dataFormatada}
          </p>

          {/* Assinaturas */}
          <div>
            <h3 className="font-semibold uppercase text-xs tracking-wider text-muted-foreground mb-3">
              Assinaturas
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Requerente */}
              <div className="border rounded-lg p-4 text-center">
                {req.assinaturas.find((a) => a.papel === "requerente") ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
                    <p className="text-xs font-medium">Assinado</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.assinaturas.find((a) => a.papel === "requerente")!.assinadoEm)
                        .toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="h-8 border-b-2 border-dashed border-muted-foreground/30 mx-4" />
                    <p className="text-xs text-muted-foreground">Assinatura e RG do Requerente</p>
                  </div>
                )}
              </div>
              {/* Análise */}
              <div className="border rounded-lg p-4 text-center">
                {req.assinaturas.find((a) => a.papel === "analisador") ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="h-8 w-8 text-blue-600 mx-auto" />
                    <p className="text-xs font-medium">Assinado</p>
                    <p className="text-xs text-muted-foreground">
                      {req.assinaturas.find((a) => a.papel === "analisador")!.nome ?? "Secretaria"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="h-8 border-b-2 border-dashed border-muted-foreground/30 mx-4" />
                    <p className="text-xs text-muted-foreground">Supervisor Pedagógico / Chefe de Secretaria</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resultado da análise */}
          {(req.status === "deferido" || req.status === "indeferido") && (
            <div className={`border rounded-lg p-4 ${req.status === "deferido" ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/20"}`}>
              <div className="flex items-center gap-2 mb-2">
                {req.status === "deferido"
                  ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                  : <XCircle className="h-5 w-5 text-red-600" />}
                <p className="font-semibold uppercase text-sm">
                  {req.status === "deferido" ? "Deferido" : "Indeferido"}
                  {req.analisadoEm && ` em ${new Date(req.analisadoEm).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              {req.parecer && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{req.parecer}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!jaAssinou && req.status === "pendente" && (
            <Button onClick={onAssinar}>
              <Pen className="h-4 w-4 mr-2" /> Assinar Requerimento
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de Novo Requerimento ─────────────────────────────────────────────────
function NovoRequerimentoModal({
  elegibilidade, tipos, onClose,
}: {
  elegibilidade: ElegibilidadeResp;
  tipos: Tipo[];
  onClose: (created?: any) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [estudanteId, setEstudanteId] = useState(
    elegibilidade.estudantes?.length === 1 ? elegibilidade.estudantes[0].id : ""
  );
  const [assuntoId, setAssuntoId] = useState("");
  const [motivos, setMotivos] = useState("");
  const [loading, setLoading] = useState(false);

  const allAssuntos = tipos.flatMap((t) => t.assuntos);
  const assunto = allAssuntos.find((a) => a.id === assuntoId);
  const palavras = contarPalavras(motivos);
  const estudante = elegibilidade.estudantes?.find((e) => e.id === estudanteId);

  async function handleSalvar() {
    if (!estudanteId) return toast({ title: "Selecione o estudante.", variant: "destructive" });
    if (!assuntoId)   return toast({ title: "Selecione o assunto.", variant: "destructive" });
    if (assunto?.requerMotivos && !motivos.trim()) {
      return toast({ title: "Este assunto requer a exposição de motivos.", variant: "destructive" });
    }
    if (palavras > 1000) {
      return toast({ title: "A exposição de motivos deve ter no máximo 1000 palavras.", variant: "destructive" });
    }
    setLoading(true);
    try {
      const r = await api("/api/requerimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estudanteId, assuntoId, exposicaoMotivos: motivos || null }),
      });
      const criado = await r.json();
      toast({ title: `Requerimento ${criado.numero} criado com sucesso.` });
      onClose(criado);
    } catch (err: any) {
      toast({ title: err?.data?.error ?? "Erro ao criar requerimento.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Novo Requerimento Geral
          </DialogTitle>
          {/* Stepper */}
          <div className="flex items-center gap-1 pt-2">
            {[
              { n: 1, label: "Estudante" },
              { n: 2, label: "Assunto" },
              { n: 3, label: "Motivos" },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border-2 transition-colors
                  ${step >= s.n ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 text-muted-foreground"}`}>
                  {step > s.n ? <CheckCircle2 className="h-3 w-3" /> : s.n}
                </div>
                <span className={`text-xs ${step === s.n ? "font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                {i < 2 && <div className="flex-1 h-px bg-muted mx-1" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="py-2 min-h-[260px]">
          {/* Step 1 — Estudante */}
          {step === 1 && (
            <div className="space-y-4">
              {(elegibilidade.estudantes?.length ?? 0) > 1 ? (
                <div className="space-y-2">
                  <Label>Para qual estudante é o requerimento?</Label>
                  <div className="space-y-2">
                    {elegibilidade.estudantes!.map((est) => (
                      <label key={est.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                          ${estudanteId === est.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                        onClick={() => setEstudanteId(est.id)}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
                          ${estudanteId === est.id ? "border-primary" : "border-muted-foreground/40"}`}>
                          {estudanteId === est.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{est.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {[
                              est.cursoNome ?? "Sem curso",
                              est.turmaSigla,
                              est.turnos?.length ? est.turnos.join(" / ") : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 border rounded-lg bg-muted/30 flex items-center gap-3">
                  <GraduationCap className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{estudante?.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        estudante?.cursoNome ?? "Sem curso",
                        estudante?.turmaSigla,
                        estudante?.turnos?.length ? estudante.turnos.join(" / ") : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              )}

              <Alert className="text-xs">
                <AlertCircle className="h-3 w-3" />
                <AlertDescription>
                  Assinar o requerimento não garante o deferimento. A resposta será dada em até 5 dias úteis.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Step 2 — Assunto */}
          {step === 2 && (
            <div className="space-y-3">
              <Label>Selecione o assunto do requerimento</Label>
              <p className="text-xs text-muted-foreground">
                Venho por meio deste requerer a Vossa Senhoria:
              </p>
              <div className="space-y-2">
                {allAssuntos.map((a) => (
                  <label key={a.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                      ${assuntoId === a.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                    onClick={() => setAssuntoId(a.id)}>
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                      ${assuntoId === a.id ? "border-primary" : "border-muted-foreground/40"}`}>
                      {assuntoId === a.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{a.nome}</p>
                      {a.descricao && <p className="text-xs text-muted-foreground">{a.descricao}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 — Motivos */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-lg text-sm">
                <p className="text-xs text-muted-foreground">Assunto selecionado</p>
                <p className="font-semibold">{assunto?.nome}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="motivos">
                  Exposição de Motivos
                  {assunto?.requerMotivos ? " *" : " (opcional)"}
                </Label>
                <Textarea
                  id="motivos"
                  placeholder="Descreva os motivos do seu requerimento..."
                  value={motivos}
                  onChange={(e) => setMotivos(e.target.value)}
                  rows={7}
                  className="resize-none"
                />
                <div className={`text-xs text-right ${palavras > 1000 ? "text-destructive" : "text-muted-foreground"}`}>
                  {palavras} / 1000 palavras
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as any)}>
              Voltar
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={() => {
                if (step === 1 && !estudanteId) {
                  toast({ title: "Selecione o estudante.", variant: "destructive" });
                  return;
                }
                if (step === 2 && !assuntoId) {
                  toast({ title: "Selecione o assunto.", variant: "destructive" });
                  return;
                }
                setStep((s) => (s + 1) as any);
              }}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSalvar} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar Requerimento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function RequerimentosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showNovo, setShowNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<Requerimento | null>(null);
  const [assinar, setAssinar] = useState<string | null>(null); // requerimentoId

  const { data: elegibilidade, isLoading: loadEleg, isError: errEleg } = useQuery<ElegibilidadeResp>({
    queryKey: ["requerimentos-elegibilidade"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/requerimentos/elegibilidade`, { credentials: "include" });
      const body = await r.json().catch(() => ({}));
      // 403 com elegivel:false é resposta legítima da API, não erro de fetch
      if (r.status === 403) return body as ElegibilidadeResp;
      if (!r.ok) throw body;
      return body as ElegibilidadeResp;
    },
    retry: false,
  });

  const { data: tipos = [] } = useQuery<Tipo[]>({
    queryKey: ["requerimentos-tipos"],
    queryFn: () => fetchJson("/api/requerimentos/tipos"),
    enabled: elegibilidade?.elegivel === true,
  });

  const { data: lista = [], isLoading: loadLista } = useQuery<Requerimento[]>({
    queryKey: ["requerimentos"],
    queryFn: () => fetchJson("/api/requerimentos"),
    enabled: elegibilidade?.elegivel === true,
  });

  if (loadEleg) {
    return (
      <div className="flex items-center justify-center h-60">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (errEleg) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Erro ao verificar elegibilidade</h2>
            <p className="text-muted-foreground text-sm">Tente recarregar a página. Se o problema persistir, contate o suporte.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!elegibilidade?.elegivel) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Formulário indisponível</h2>
            <p className="text-muted-foreground text-sm">
              {elegibilidade?.motivo ?? "Você não possui acesso ao Requerimento Geral."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Requerimento Geral
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Solicite documentos, transferências, aproveitamentos e outros serviços da Secretaria.
          </p>
        </div>
        <Button onClick={() => setShowNovo(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Requerimento
        </Button>
      </div>

      {/* Aviso */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          A resposta será dada no prazo máximo de <strong>05 dias úteis</strong>. Compareça à Secretaria Escolar para obter o resultado.
        </AlertDescription>
      </Alert>

      {/* Lista */}
      {loadLista ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Nenhum requerimento enviado ainda.</p>
            <Button className="mt-4" onClick={() => setShowNovo(true)}>
              <Plus className="h-4 w-4 mr-2" /> Criar meu primeiro requerimento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((req) => {
            const jaAssinou = req.assinaturas.some((a) => a.papel === "requerente");
            return (
              <Card key={req.id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setDetalhe(req)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{req.numero}</span>
                        <StatusBadge status={req.status} />
                        {!jaAssinou && req.status === "pendente" && (
                          <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                            Aguardando assinatura
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold mt-1 text-sm">{req.assuntoNome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Para: <strong>{req.estudanteNome}</strong> · {new Date(req.criadoEm).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {jaAssinou
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <Clock className="h-4 w-4 text-amber-500" />}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modais */}
      {showNovo && elegibilidade && tipos.length > 0 && (
        <NovoRequerimentoModal
          elegibilidade={elegibilidade}
          tipos={tipos}
          onClose={(created) => {
            setShowNovo(false);
            if (created) {
              qc.invalidateQueries({ queryKey: ["requerimentos"] });
              setDetalhe(created);
            }
          }}
        />
      )}

      {detalhe && (
        <DetalheModal
          req={detalhe}
          onClose={() => setDetalhe(null)}
          onAssinar={() => { setAssinar(detalhe.id); setDetalhe(null); }}
        />
      )}

      {assinar && (
        <AssinarModal
          requerimentoId={assinar}
          papel="requerente"
          onClose={() => { setAssinar(null); qc.invalidateQueries({ queryKey: ["requerimentos"] }); }}
        />
      )}
    </div>
  );
}
