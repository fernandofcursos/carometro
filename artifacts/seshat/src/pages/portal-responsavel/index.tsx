import { useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserCircle, GraduationCap, AlertTriangle, CheckCircle2, CreditCard,
  FileText, Upload, Download, Users, Fingerprint,
} from "lucide-react";
import { AvisosWidget } from "@/components/avisos-widget";
import { CardapioWidget } from "@/components/cardapio-widget";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type EstudanteInfo = {
  id: string; nome: string | null; registro: string | null; fotoUrl: string | null;
  turmaId: string | null; turmaSigla: string | null; turmaDescricao: string | null;
  cursoNome: string | null; moduloMenor: boolean | null;
  turnos: { id: string; nome: string }[];
};

type PortalMe = {
  usuario: { id: string; nome: string | null; fotoUrl: string | null };
  estudantes: EstudanteInfo[];
};

type Ocorrencia = {
  id: string; tipoOcorrenciaDescricao: string;
  dataOcorrencia: string; observacao: string | null;
  cienteEm: string | null; cientePorId: string | null;
};

type CartaoSaida = {
  id: string; dataSaida: string; horarioSaida: string | null;
  motivo: string | null; status: string;
  aprovadoEm: string | null; observacaoAprovador: string | null;
  token: string | null; criadoEm: string;
};

// Alias para uso no componente de cartão de liberação (mesmo shape, nome explícito)
type CartaoSaidaDB = CartaoSaida;

type Atestado = {
  id: string; dataInicio: string; dataFim: string | null;
  nomeArquivo: string; mimeType: string; tamanhoBytes: number; criadoEm: string;
};

type CarteiraDB = { id: string; tipo: string; ano: number; semestre: number; status: string; token: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

async function postJson(url: string, body?: object) {
  const r = await fetch(url, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.substring(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente:  "bg-yellow-100 text-yellow-800 border-yellow-200",
    aprovado:  "bg-green-100 text-green-800 border-green-200",
    recusado:  "bg-red-100 text-red-700 border-red-200",
    ativa:     "bg-green-100 text-green-800 border-green-200",
    cancelada: "bg-gray-200 text-gray-700",
    revogada:  "bg-red-100 text-red-700",
  };
  return <Badge className={`text-xs ${map[status] ?? ""}`}>{status}</Badge>;
}

// ── QR Code canvas ────────────────────────────────────────────────────────────

function QrCodeCanvas({ value, size = 130 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 2, errorCorrectionLevel: "M" });
  }, [value, size]);
  return <canvas ref={canvasRef} className="rounded" />;
}

// ── Aba: Dados + Carteira ─────────────────────────────────────────────────────

function DadosEstudanteTab({ est }: { est: EstudanteInfo }) {
  const { data: carteiras = [] } = useQuery<CarteiraDB[]>({
    queryKey: ["resp-carteiras", est.id],
    queryFn:  () => fetchJson(`${BASE}/api/portal-responsavel/carteiras/${est.id}`),
  });
  const carteira = carteiras.find((c) => c.tipo === "carteira" && c.status === "ativa") ?? null;
  const verUrl   = carteira ? `${window.location.origin}${BASE}/verificar/${carteira.token}` : "";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div><span className="text-muted-foreground text-xs">Registro:</span> {est.registro ?? "—"}</div>
          <div><span className="text-muted-foreground text-xs">Turma:</span> {est.turmaSigla ?? "Não enturmado"}</div>
          <div><span className="text-muted-foreground text-xs">Curso:</span> {est.cursoNome ?? "—"}</div>
          <div><span className="text-muted-foreground text-xs">Turno(s):</span> {est.turnos.map((t) => t.nome).join(", ") || "—"}</div>
        </CardContent>
      </Card>

      <div>
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Carteira de Estudante
          {carteira && <StatusBadge status={carteira.status} />}
        </h4>
        {carteira ? (
          <Card className="w-full max-w-xs bg-gradient-to-br from-blue-700 to-blue-900 text-white shadow-lg">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 border-b border-blue-500 pb-2 text-xs font-semibold">
                <GraduationCap className="w-4 h-4" />
                Secretaria de Educação do DF
              </div>
              <div className="flex gap-3 items-start">
                {est.fotoUrl ? (
                  <img src={est.fotoUrl} alt="Foto" className="w-16 h-20 object-cover rounded border border-blue-400 flex-shrink-0" />
                ) : (
                  <div className="w-16 h-20 bg-blue-600 rounded border border-blue-400 flex items-center justify-center flex-shrink-0">
                    <UserCircle className="w-8 h-8 text-blue-300" />
                  </div>
                )}
                <div className="text-xs flex flex-col gap-0.5">
                  <span className="font-bold text-sm leading-snug">{est.nome}</span>
                  <span className="text-blue-200">{est.cursoNome}</span>
                  <span className="text-blue-300">Turma {est.turmaSigla}</span>
                  <span className="text-blue-300">Mat. {est.registro}</span>
                </div>
              </div>
              <div className="flex justify-between text-xs border-t border-blue-500 pt-1">
                <span className="text-blue-300">Validade:</span>
                <span className="font-semibold">{carteira.semestre}º sem. / {carteira.ano}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="bg-white p-1 rounded">
                  <QrCodeCanvas value={verUrl} size={80} />
                </div>
                <p className="text-[9px] text-blue-400">Escaneie para verificar</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma carteira ativa emitida para este estudante.</p>
        )}
      </div>
    </div>
  );
}

// ── Aba: Ocorrências ──────────────────────────────────────────────────────────

function OcorrenciasTab({ estudanteId }: { estudanteId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<Ocorrencia | null>(null);

  const { data: ocorrencias = [], isLoading } = useQuery<Ocorrencia[]>({
    queryKey: ["resp-ocorrencias", estudanteId],
    queryFn:  () => fetchJson(`${BASE}/api/portal-responsavel/ocorrencias/${estudanteId}`),
  });

  const cienciaMut = useMutation({
    mutationFn: (id: string) => postJson(`${BASE}/api/portal-responsavel/ocorrencias/${id}/ciencia`),
    onSuccess: () => {
      toast({ title: "Ciência registrada com sucesso." });
      qc.invalidateQueries({ queryKey: ["resp-ocorrencias", estudanteId] });
    },
    onError:   (e: Error) => toast({ variant: "destructive", title: e.message }),
    onSettled: () => setConfirming(null),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!ocorrencias.length) return <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {ocorrencias.map((oc) => (
          <Card key={oc.id} className={oc.cienteEm ? "border-green-200 bg-green-50/30 dark:bg-green-950/10" : ""}>
            <CardContent className="p-4 flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{oc.tipoOcorrenciaDescricao}</p>
                <p className="text-xs text-muted-foreground">Data: {fmt(oc.dataOcorrencia)}</p>
                {oc.observacao && <p className="text-xs mt-1 text-muted-foreground">{oc.observacao}</p>}
              </div>
              {oc.cienteEm ? (
                <Badge variant="secondary" className="flex-shrink-0 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Ciente em {fmt(oc.cienteEm)}
                </Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(oc)} className="flex-shrink-0">
                  Dar ciência
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ciência</AlertDialogTitle>
            <AlertDialogDescription>
              Você declara estar ciente da ocorrência: <strong>{confirming?.tipoOcorrenciaDescricao}</strong> em {fmt(confirming?.dataOcorrencia ?? null)}.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancelar</Button>
            <Button onClick={() => confirming && cienciaMut.mutate(confirming.id)} disabled={cienciaMut.isPending}>
              Confirmar ciência
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Paleta de cores por dia da semana — Cartão de Liberação ──────────────────
const COR_DIA: Record<number, { bg: string; strip: string; curve1: string; curve2: string; curve3: string; text: string; label: string }> = {
  1: { bg: "#dbeafe", strip: "#1d4ed8", curve1: "#3b82f6", curve2: "#60a5fa", curve3: "#93c5fd", text: "#1e3a8a", label: "Segunda-feira" },
  2: { bg: "#fee2e2", strip: "#991b1b", curve1: "#dc2626", curve2: "#f87171", curve3: "#fca5a5", text: "#7f1d1d", label: "Terça-feira" },
  3: { bg: "#fefce8", strip: "#a16207", curve1: "#ca8a04", curve2: "#facc15", curve3: "#fde047", text: "#713f12", label: "Quarta-feira" },
  4: { bg: "#ede9fe", strip: "#3730a3", curve1: "#6d28d9", curve2: "#8b5cf6", curve3: "#a78bfa", text: "#1e1b4b", label: "Quinta-feira" },
  5: { bg: "#fdf2f8", strip: "#9d174d", curve1: "#db2777", curve2: "#f472b6", curve3: "#f9a8d4", text: "#831843", label: "Sexta-feira" },
};
const COR_SEMESTRAL = { bg: "#dcfce7", strip: "#166534", curve1: "#16a34a", curve2: "#4ade80", curve3: "#86efac", text: "#14532d", label: "Semestral" };

function getCorDia(dataSaida: string) {
  const [a, m, d] = dataSaida.split("-").map(Number);
  const dow = new Date(a, m - 1, d).getDay();
  return COR_DIA[dow] ?? COR_DIA[1];
}

function dentroJanelaHorario(dataSaida: string, horarioSaida: string | null): boolean {
  if (!horarioSaida) return false;
  const [hh, mm] = horarioSaida.split(":").map(Number);
  const agora = new Date();
  const hoje = agora.toISOString().substring(0, 10);
  if (dataSaida !== hoje) return false;
  const totalMin = agora.getHours() * 60 + agora.getMinutes();
  const alvoMin  = hh * 60 + mm;
  return Math.abs(totalMin - alvoMin) <= 5;
}

// ── Card visual CIE — Cartão de Liberação (adaptado para EstudanteInfo) ────────
function CartaoLiberacaoCard({
  est, cartao, semestral,
}: {
  est: EstudanteInfo;
  cartao: CarteiraDB | CartaoSaidaDB;
  semestral: boolean;
}) {
  const cor = semestral ? COR_SEMESTRAL : getCorDia((cartao as CartaoSaidaDB).dataSaida ?? "");
  const token = cartao.token ?? "";
  const verUrl = token ? `${window.location.origin}${BASE}/verificar/${token}` : "";

  const validade = semestral
    ? `${(cartao as CarteiraDB).semestre}º sem. / ${(cartao as CarteiraDB).ano}`
    : `${(cartao as CartaoSaidaDB).dataSaida?.split("-").reverse().join("/")} ${(cartao as CartaoSaidaDB).horarioSaida?.substring(0, 5) ?? ""}`;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 560, margin: "0 auto", aspectRatio: "560/320" }}>
      <div style={{ position: "absolute", inset: 0, background: cor.bg, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.13)" }}>
        {/* Curvas decorativas */}
        <svg style={{ position: "absolute", bottom: 0, left: 0, width: 130, height: 110, opacity: 0.7 }} viewBox="0 0 130 110" fill="none">
          <path d="M0 110 Q 0 20 110 0 L 0 0 Z" fill={cor.curve1} opacity="0.25" />
          <path d="M0 110 Q 10 50 90 10 L 0 10 Z" fill={cor.curve2} opacity="0.35" />
          <path d="M0 110 Q 15 70 70 30 L 0 30 Z" fill={cor.curve3} opacity="0.5" />
        </svg>
        {/* Faixa lateral */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 14, background: cor.strip, borderRadius: "0 12px 12px 0" }} />

        <div className="relative h-full flex flex-col" style={{ padding: "14px 28px 14px 18px" }}>
          {/* Cabeçalho */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <p style={{ fontSize: 8, color: cor.strip, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.2 }}>Cartão de</p>
              <p style={{ fontSize: 10, color: cor.text, fontWeight: 800, letterSpacing: "0.04em", lineHeight: 1.2 }}>Liberação {cor.label}</p>
            </div>
            <p style={{ fontSize: 9, color: cor.strip, fontWeight: 600 }}>Sec. Est. de Educação do DF</p>
          </div>

          {/* Nome */}
          <p style={{ fontSize: 13, fontWeight: 800, color: cor.text, marginBottom: 8, lineHeight: 1.2 }}>{est.nome ?? "—"}</p>

          {/* Corpo */}
          <div className="flex gap-3 flex-1 items-start">
            {/* Foto */}
            <div className="flex-shrink-0 rounded overflow-hidden" style={{ width: 72, height: 88, background: "#fff", border: `2px solid ${cor.strip}` }}>
              {est.fotoUrl ? (
                <img src={est.fotoUrl} alt="Foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UserCircle style={{ width: 36, height: 36, color: cor.strip }} />
                </div>
              )}
            </div>

            {/* Campos */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0" style={{ fontSize: 9.5 }}>
              {est.cursoNome && <div><span style={{ color: cor.strip, fontWeight: 600 }}>Curso: </span><span style={{ color: cor.text }}>{est.cursoNome}</span></div>}
              {est.turmaSigla && <div><span style={{ color: cor.strip, fontWeight: 600 }}>Turma: </span><span style={{ color: cor.text }}>{est.turmaSigla}</span></div>}
              {est.turnos[0] && <div><span style={{ color: cor.strip, fontWeight: 600 }}>Turno: </span><span style={{ color: cor.text }}>{est.turnos[0].nome}</span></div>}
              {est.registro && <div><span style={{ color: cor.strip, fontWeight: 600 }}>Matrícula: </span><span style={{ color: cor.text }}>{est.registro}</span></div>}
              <div><span style={{ color: cor.strip, fontWeight: 600 }}>Validade: </span><span style={{ color: cor.text, fontWeight: 700 }}>{validade}</span></div>
              {!semestral && (cartao as CartaoSaidaDB).motivo && (
                <div><span style={{ color: cor.strip, fontWeight: 600 }}>Motivo: </span><span style={{ color: cor.text }}>{(cartao as CartaoSaidaDB).motivo}</span></div>
              )}
            </div>

            {/* QR Code */}
            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              {verUrl ? (
                <QrCodeCanvas value={verUrl} size={76} />
              ) : (
                <div style={{ width: 76, height: 76, background: "#fff", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 8, color: cor.strip, textAlign: "center", padding: 4 }}>QR indisponível</span>
                </div>
              )}
              <span style={{ fontSize: 7, color: cor.text, letterSpacing: "0.04em", fontFamily: "monospace" }}>
                {token ? token.split(".")[0]?.slice(-12).toUpperCase() : "—"}
              </span>
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex items-end justify-between mt-1">
            <span style={{ fontSize: 6.5, color: cor.text, opacity: 0.6, maxWidth: 200 }}>
              Documento protegido pela LGPD (Lei 13.709/2018) — uso exclusivo para identificação e controle de saída escolar.
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: cor.strip, lineHeight: 1 }}>
              {semestral ? (cartao as CarteiraDB).ano : new Date((cartao as CartaoSaidaDB).dataSaida + "T00:00:00").getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Aba: Cartão de Liberação (responsável) ────────────────────────────────────
function CartaoLiberacaoTab({ est }: { est: EstudanteInfo }) {
  const [subAba, setSubAba] = useState<"semestral" | "diario">("semestral");

  const { data: carteiras = [] } = useQuery<CarteiraDB[]>({
    queryKey: ["resp-carteiras", est.id],
    queryFn: () => fetchJson(`${BASE}/api/portal-responsavel/carteiras/${est.id}`),
  });
  const cartaoSemestral = carteiras
    .filter((c) => c.tipo === "cartao-semestral")
    .sort((a, b) => b.ano - a.ano || b.semestre - a.semestre)[0] ?? null;

  const { data: cartoesDiarios = [] } = useQuery<CartaoSaidaDB[]>({
    queryKey: ["resp-cartoes-saida", est.id],
    queryFn: () => fetchJson(`${BASE}/api/portal-responsavel/cartoes-saida/${est.id}`),
    refetchInterval: 30_000,
  });

  const cartaoDiarioAtivo = cartoesDiarios.find(
    (c) => c.status === "aprovado" && dentroJanelaHorario(c.dataSaida, c.horarioSaida)
  ) ?? null;

  const hoje = new Date().toISOString().substring(0, 10);
  const proximoCartao = cartoesDiarios
    .filter((c) => c.status === "aprovado" && c.dataSaida >= hoje)
    .sort((a, b) => a.dataSaida.localeCompare(b.dataSaida))[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-abas */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubAba("semestral")}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${subAba === "semestral" ? "bg-green-100 text-green-800 border border-green-300" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          Semestral
        </button>
        <button
          onClick={() => setSubAba("diario")}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${subAba === "diario" ? "text-white border" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          style={subAba === "diario" ? { background: getCorDia(hoje).strip, borderColor: getCorDia(hoje).strip } : {}}
        >
          Diário
        </button>
      </div>

      {/* Semestral */}
      {subAba === "semestral" && (
        cartaoSemestral && cartaoSemestral.status === "ativa" ? (
          <>
            <CartaoLiberacaoCard est={est} cartao={cartaoSemestral} semestral />
            <Button variant="outline" size="sm" onClick={() => window.print()} className="w-full">
              Imprimir cartão
            </Button>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-green-300 bg-green-50/50 p-6 text-center flex flex-col gap-2 items-center">
            <Fingerprint className="w-8 h-8 text-green-600" />
            <p className="text-sm font-medium text-green-800">Nenhum cartão de liberação semestral ativo</p>
            <p className="text-xs text-muted-foreground">
              O cartão semestral é emitido pela coordenação após aprovação do requerimento de liberação semestral.
              {cartaoSemestral && cartaoSemestral.status !== "ativa" && (
                <> O último cartão foi <strong>{cartaoSemestral.status}</strong>.</>
              )}
            </p>
          </div>
        )
      )}

      {/* Diário */}
      {subAba === "diario" && (
        cartaoDiarioAtivo ? (
          <>
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Cartão válido agora — apresente ao responsável pela portaria para validação via QR Code.
            </div>
            <CartaoLiberacaoCard est={est} cartao={cartaoDiarioAtivo} semestral={false} />
            <Button variant="outline" size="sm" onClick={() => window.print()} className="w-full">
              Imprimir cartão
            </Button>
          </>
        ) : proximoCartao ? (
          <div className="rounded-xl border border-dashed p-6 text-center flex flex-col gap-2 items-center"
            style={{ borderColor: getCorDia(proximoCartao.dataSaida).strip, background: getCorDia(proximoCartao.dataSaida).bg + "66" }}>
            <Fingerprint className="w-8 h-8" style={{ color: getCorDia(proximoCartao.dataSaida).strip }} />
            <p className="text-sm font-medium" style={{ color: getCorDia(proximoCartao.dataSaida).text }}>
              Cartão aprovado para {fmt(proximoCartao.dataSaida)} às {proximoCartao.horarioSaida?.substring(0, 5) ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              O cartão ficará disponível 5 minutos antes do horário solicitado e expira 5 minutos após.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-muted p-6 text-center flex flex-col gap-2 items-center">
            <Fingerprint className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum cartão de liberação diário aprovado</p>
            <p className="text-xs text-muted-foreground">
              Solicite a liberação antecipada através do formulário de Requerimentos.
              O cartão será exibido na janela de ±5 minutos do horário aprovado.
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ── Aba: Atestados Médicos ────────────────────────────────────────────────────

function AtestadosTab({ estudanteId }: { estudanteId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);

  const { data: atestados = [], isLoading } = useQuery<Atestado[]>({
    queryKey: ["resp-atestados", estudanteId],
    queryFn:  () => fetchJson(`${BASE}/api/portal-responsavel/atestados/${estudanteId}`),
  });

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Arquivo muito grande. Máximo: 10 MB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setArquivo({ nome: file.name, base64: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const enviarMut = useMutation({
    mutationFn: () => postJson(`${BASE}/api/portal-responsavel/atestado`, {
      estudanteId, dataInicio, dataFim: dataFim || undefined,
      nomeArquivo: arquivo!.nome, arquivoBase64: arquivo!.base64,
    }),
    onSuccess: () => {
      toast({ title: "Atestado enviado com sucesso." });
      qc.invalidateQueries({ queryKey: ["resp-atestados", estudanteId] });
      setShowForm(false); setDataInicio(""); setDataFim(""); setArquivo(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Envie atestados para justificar ausências. PDF, JPG ou PNG (máx. 10 MB). Armazenamento criptografado.
        </p>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1 flex-shrink-0">
          {showForm ? <X className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Enviar atestado"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data início do afastamento *</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data fim (opcional)</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Arquivo *</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} />
              {arquivo && <p className="text-xs text-muted-foreground mt-1">{arquivo.nome}</p>}
            </div>
            <Button onClick={() => enviarMut.mutate()} disabled={!dataInicio || !arquivo || enviarMut.isPending} size="sm">
              {enviarMut.isPending ? "Enviando..." : "Enviar atestado"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p>
        : !atestados.length ? <p className="text-sm text-muted-foreground">Nenhum atestado enviado.</p>
        : atestados.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  {a.nomeArquivo}
                </p>
                <p className="text-xs text-muted-foreground">
                  Período: {fmt(a.dataInicio)}{a.dataFim ? ` a ${fmt(a.dataFim)}` : ""} · {fmtBytes(a.tamanhoBytes)}
                </p>
                <p className="text-xs text-muted-foreground">Enviado em {fmt(a.criadoEm)}</p>
              </div>
              <a
                href={`${BASE}/api/portal-responsavel/atestados/${estudanteId}/${a.id}/download`}
                download={a.nomeArquivo}
                className="flex-shrink-0"
              >
                <Button size="sm" variant="outline" className="gap-1">
                  <Download className="w-3.5 h-3.5" /> Baixar
                </Button>
              </a>
            </CardContent>
          </Card>
        ))
      }
    </div>
  );
}

// ── Card do estudante no accordion ───────────────────────────────────────────

function EstudanteAccordionHeader({ est }: { est: EstudanteInfo }) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
      {est.fotoUrl ? (
        <img
          src={est.fotoUrl}
          alt="Foto"
          className="w-9 h-9 rounded-full object-cover border-2 border-primary/20 flex-shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 text-left">
        <p className="font-semibold text-sm truncate">{est.nome ?? "Estudante"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {est.turmaSigla ? `${est.turmaSigla} · ` : ""}{est.cursoNome ?? "Não enturmado"}
        </p>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PortalResponsavelPage() {
  const [openItems, setOpenItems] = useState<string[]>([]);

  const { data: me, isLoading, isError } = useQuery<PortalMe>({
    queryKey: ["portal-responsavel-me"],
    queryFn:  () => fetchJson(`${BASE}/api/portal-responsavel/me`),
  });

  // Abrir o primeiro filho automaticamente ao carregar
  useEffect(() => {
    if (me && me.estudantes.length > 0 && openItems.length === 0) {
      setOpenItems([me.estudantes[0].id]);
    }
  }, [me]);

  if (isLoading) return <p className="p-8 text-muted-foreground">Carregando...</p>;
  if (isError || !me) return (
    <div className="p-8 flex flex-col gap-2 items-center">
      <AlertTriangle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-destructive">Não foi possível carregar seus dados.</p>
    </div>
  );

  const { usuario, estudantes } = me;

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Cabeçalho do responsável */}
      <div className="flex items-center gap-4">
        {usuario.fotoUrl ? (
          <img src={usuario.fotoUrl} alt="Foto" className="w-14 h-14 rounded-full object-cover border-2 border-primary/30" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <UserCircle className="w-7 h-7 text-muted-foreground" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{usuario.nome ?? "Responsável"}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {estudantes.length === 0
              ? "Nenhum estudante vinculado"
              : `${estudantes.length} estudante${estudantes.length !== 1 ? "s" : ""} vinculado${estudantes.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Sem vínculos */}
      {estudantes.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center flex flex-col gap-2">
            <GraduationCap className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum estudante vinculado</p>
            <p className="text-xs text-muted-foreground">
              Solicite ao coordenador que vincule sua conta ao(s) seu(s) filho(s) matriculado(s).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Accordion com todos os filhos */}
      {estudantes.length > 0 && (
        <Accordion
          type="multiple"
          value={openItems}
          onValueChange={setOpenItems}
          className="flex flex-col gap-3"
        >
          {estudantes.map((est) => (
            <AccordionItem
              key={est.id}
              value={est.id}
              className="border rounded-lg overflow-hidden bg-card shadow-sm"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40 transition-colors">
                <EstudanteAccordionHeader est={est} />
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4 pt-2">
                <Tabs defaultValue="dados">
                  <TabsList className="w-full mb-4">
                    <TabsTrigger value="dados" className="flex-1 gap-1 text-xs">
                      <GraduationCap className="w-3.5 h-3.5" /> Dados
                    </TabsTrigger>
                    <TabsTrigger value="ocorrencias" className="flex-1 gap-1 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5" /> Ocorrências
                    </TabsTrigger>
                    <TabsTrigger value="cartao-saida" className="flex-1 gap-1 text-xs">
                      <CreditCard className="w-3.5 h-3.5" /> Cartão de Liberação
                    </TabsTrigger>
                    <TabsTrigger value="atestados" className="flex-1 gap-1 text-xs">
                      <FileText className="w-3.5 h-3.5" /> Atestados
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dados">
                    <DadosEstudanteTab est={est} />
                  </TabsContent>
                  <TabsContent value="ocorrencias">
                    <OcorrenciasTab estudanteId={est.id} />
                  </TabsContent>
                  <TabsContent value="cartao-saida">
                    <CartaoLiberacaoTab est={est} />
                  </TabsContent>
                  <TabsContent value="atestados">
                    <AtestadosTab estudanteId={est.id} />
                  </TabsContent>
                </Tabs>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      <AvisosWidget perfil="pai_responsavel" limite={5} />
      <CardapioWidget className="mt-4" />
    </div>
  );
}
