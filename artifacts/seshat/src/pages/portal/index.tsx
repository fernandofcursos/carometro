import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserCircle, BookOpen, AlertTriangle, CheckCircle2, GraduationCap, CreditCard, Fingerprint } from "lucide-react";
import { useAuth } from "@/contexts/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type PortalMe = {
  usuario: {
    id: string; nome: string | null; codigoAcesso: string;
    dataNascimento: string | null; fotoUrl: string | null; isMaior: boolean;
  };
  matriculas: Array<{
    id: string; turmaId: string; turmaSigla: string; turmaDescricao: string;
    cursoId: string; cursoNome: string; moduloMenor: boolean;
    turnos: { id: string; nome: string }[];
    registro: string; ano: number; semestre: number;
  }>;
  disciplinas: Array<{
    disciplinaOfertaId: string; disciplinaNome: string;
    cursoNome: string; turnoNome: string;
  }>;
};

type OcorrenciaPortal = {
  id: string; tipoOcorrenciaDescricao: string;
  dataOcorrencia: string; observacao: string | null;
  cienteEm: string | null; cientePorId: string | null;
};

type CarteiraDB = {
  id: string; tipo: string; ano: number; semestre: number;
  status: string; token: string; criadoEm: string;
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

async function postJson(url: string) {
  const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.substring(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function calcularIdade(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const hoje = new Date();
  const nasc  = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

// ── QR Code canvas ────────────────────────────────────────────────────────────

function QrCodeCanvas({ value, size = 160 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 2, errorCorrectionLevel: "M" });
  }, [value, size]);
  return <canvas ref={canvasRef} className="rounded" />;
}

// ── Status badge da carteira ──────────────────────────────────────────────────

function StatusCarteiraBadge({ status }: { status: string }) {
  if (status === "ativa")     return <Badge className="bg-green-100 text-green-800 border-green-200">Ativa</Badge>;
  if (status === "cancelada") return <Badge variant="destructive">Cancelada</Badge>;
  if (status === "revogada")  return <Badge className="bg-gray-200 text-gray-700">Revogada</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

// ── Carteira de Estudante — layout CIE 2026 ──────────────────────────────────
// Lei 12.989/2014 · SEEDF · LGPD art. 6º · ISO 27001 A.9.4

function CarteiraEstudante({ me, carteira }: { me: PortalMe; carteira: CarteiraDB | null }) {
  const verUrl = carteira ? `${window.location.origin}${BASE}/verificar/${carteira.token}` : "";
  const mat = me.matriculas[0];
  const anoValidade = carteira?.ano ?? new Date().getFullYear();

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Card horizontal — proporção ~1.75:1 (A6 paisagem) */}
      <div
        className="relative w-full overflow-hidden rounded-2xl shadow-2xl print:shadow-none select-none"
        style={{
          maxWidth: 560,
          aspectRatio: "560/320",
          background: "#eaecf8",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        {/* Faixa azul escura lateral direita */}
        <div
          className="absolute top-0 right-0 h-full"
          style={{ width: 14, background: "#1a2f7a" }}
        />

        {/* Elemento decorativo roxo — curva no canto inferior esquerdo */}
        <svg
          className="absolute bottom-0 left-0"
          style={{ width: 130, height: 110, opacity: 0.92 }}
          viewBox="0 0 130 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 110 Q 0 20 110 0 L 0 0 Z" fill="#6d28d9" opacity="0.25" />
          <path d="M0 110 Q 10 50 90 10 L 0 10 Z" fill="#7c3aed" opacity="0.35" />
          <path d="M0 110 Q 15 70 70 30 L 0 30 Z" fill="#8b5cf6" opacity="0.5" />
        </svg>

        {/* Conteúdo principal */}
        <div className="relative h-full flex flex-col" style={{ padding: "14px 28px 14px 18px" }}>

          {/* ── Cabeçalho: logos + título ── */}
          <div className="flex items-center justify-between mb-2">
            {/* Logo esquerda — placeholder SEEDF */}
            <div className="flex items-center gap-2">
              {/* Placeholder logo: será substituído pela logo real */}
              <div
                className="flex items-center justify-center rounded"
                style={{ width: 44, height: 44, background: "#c7cef5", border: "1.5px dashed #7c8ed8" }}
                title="Logo da instituição (a ser inserida)"
              >
                <GraduationCap style={{ width: 22, height: 22, color: "#4a5bbf" }} />
              </div>
              <div>
                <p style={{ fontSize: 8, color: "#4a5bbf", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.2 }}>
                  Carteira de
                </p>
                <p style={{ fontSize: 10, color: "#1a2f7a", fontWeight: 800, letterSpacing: "0.04em", lineHeight: 1.2 }}>
                  Identificação Estudantil
                </p>
              </div>
            </div>

            {/* Logos direita — placeholders */}
            <div className="flex items-center gap-2">
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: 36, height: 36, background: "#c7cef5", border: "1.5px dashed #7c8ed8" }}
                title="Logo 1 (a ser inserida)"
              >
                <span style={{ fontSize: 7, color: "#4a5bbf", fontWeight: 700 }}>LOGO</span>
              </div>
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: 36, height: 36, background: "#c7cef5", border: "1.5px dashed #7c8ed8" }}
                title="Logo 2 (a ser inserida)"
              >
                <span style={{ fontSize: 7, color: "#4a5bbf", fontWeight: 700 }}>LOGO</span>
              </div>
            </div>
          </div>

          {/* ── Nome do estudante ── */}
          <p style={{ fontSize: 13, fontWeight: 800, color: "#0f1c5e", marginBottom: 8, lineHeight: 1.2 }}>
            {me.usuario.nome ?? "—"}
          </p>

          {/* ── Corpo: foto | campos | QR ── */}
          <div className="flex gap-3 flex-1 items-start">

            {/* Foto */}
            <div
              className="flex-shrink-0 rounded overflow-hidden"
              style={{ width: 72, height: 88, background: "#c7cef5", border: "2px solid #9ca7e0" }}
            >
              {me.usuario.fotoUrl ? (
                <img src={me.usuario.fotoUrl} alt="Foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <UserCircle style={{ width: 36, height: 36, color: "#6d82d8" }} />
                </div>
              )}
            </div>

            {/* Campos */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0" style={{ fontSize: 9.5 }}>
              <div>
                <span style={{ color: "#5a6aac", fontWeight: 600 }}>Instituição: </span>
                <span style={{ color: "#0f1c5e", fontWeight: 500 }}>Sec. Est. de Educação do DF</span>
              </div>
              {mat && (
                <>
                  <div>
                    <span style={{ color: "#5a6aac", fontWeight: 600 }}>Curso: </span>
                    <span style={{ color: "#0f1c5e", fontWeight: 500 }}>{mat.cursoNome}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5a6aac", fontWeight: 600 }}>Turma: </span>
                    <span style={{ color: "#0f1c5e", fontWeight: 500 }}>{mat.turmaSigla}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5a6aac", fontWeight: 600 }}>Turno: </span>
                    <span style={{ color: "#0f1c5e", fontWeight: 500 }}>
                      {mat.turnos.map((t) => t.nome).join(" / ") || "—"}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#5a6aac", fontWeight: 600 }}>Matrícula: </span>
                    <span style={{ color: "#0f1c5e", fontWeight: 500 }}>{mat.registro}</span>
                  </div>
                </>
              )}
              {me.usuario.dataNascimento && (
                <div>
                  <span style={{ color: "#5a6aac", fontWeight: 600 }}>Data Nasc.: </span>
                  <span style={{ color: "#0f1c5e", fontWeight: 500 }}>{formatarData(me.usuario.dataNascimento)}</span>
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <span style={{ color: "#5a6aac", fontWeight: 600 }}>Válido até: </span>
                <span style={{ color: "#0f1c5e", fontWeight: 700 }}>
                  {carteira ? `${carteira.semestre}º sem. / ${carteira.ano}` : "—"}
                </span>
              </div>

              {carteira && carteira.status !== "ativa" && (
                <div
                  style={{
                    marginTop: 6, padding: "2px 8px", borderRadius: 4,
                    background: "#fee2e2", color: "#b91c1c",
                    fontWeight: 800, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em",
                    display: "inline-block",
                  }}
                >
                  {carteira.status === "cancelada" ? "CANCELADA" : "REVOGADA"}
                </div>
              )}
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center flex-shrink-0 gap-1">
              <div style={{ background: "#fff", padding: 4, borderRadius: 6 }}>
                {carteira && carteira.status === "ativa" ? (
                  <QrCodeCanvas value={verUrl} size={76} />
                ) : (
                  <div style={{ width: 76, height: 76, background: "#dde0f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 8, color: "#7c8ed8", textAlign: "center", padding: 4 }}>QR disponível com carteira ativa</span>
                  </div>
                )}
              </div>
              {carteira && (
                <p style={{ fontSize: 6.5, color: "#5a6aac", textAlign: "center", maxWidth: 80, lineHeight: 1.3 }}>
                  COD CIE<br />
                  <span style={{ fontWeight: 700, color: "#0f1c5e", letterSpacing: "0.03em" }}>
                    {carteira.token.split(".")[0]?.slice(-12).toUpperCase() ?? "—"}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* ── Rodapé: LGPD + ano ── */}
          <div className="flex items-end justify-between mt-2">
            <p style={{ fontSize: 6.5, color: "#7c8ed8", maxWidth: 260, lineHeight: 1.4 }}>
              Dados protegidos pela LGPD (Lei 13.709/2018) e ISO 27001.
              Uso exclusivo para identificação estudantil.
            </p>
            <p style={{ fontSize: 26, fontWeight: 900, color: "#1a2f7a", lineHeight: 1, letterSpacing: "-0.02em", marginRight: 18 }}>
              {anoValidade}
            </p>
          </div>
        </div>
      </div>

      {/* Ações abaixo do card */}
      {carteira && carteira.status === "ativa" && (
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Imprimir carteira
        </Button>
      )}
      {carteira && carteira.status !== "ativa" && (
        <p className="text-xs text-destructive text-center">
          Esta carteira foi {carteira.status}. Solicite a renovação ao coordenador.
        </p>
      )}
      {!carteira && (
        <p className="text-xs text-muted-foreground text-center">
          Nenhuma carteira emitida. A carteira é gerada automaticamente ao enturmar.
        </p>
      )}
    </div>
  );
}

// ── Cartão de Liberação (placeholder — regras a definir) ──────────────────────

function CartaoLiberacao() {
  return (
    <Card className="w-full max-w-sm border-dashed">
      <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
        <Fingerprint className="w-10 h-10 text-muted-foreground" />
        <p className="font-medium text-sm">Cartão de Liberação</p>
        <p className="text-xs text-muted-foreground">
          As regras de emissão dos cartões de liberação (semestral e diário) ainda serão definidas.
          Esta funcionalidade estará disponível em breve.
        </p>
        <Badge variant="secondary">Em breve</Badge>
      </CardContent>
    </Card>
  );
}

// ── Aba de Ocorrências ────────────────────────────────────────────────────────

function OcorrenciasTab({ isMaior }: { isMaior: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<OcorrenciaPortal | null>(null);

  const { data: ocorrencias = [], isLoading } = useQuery<OcorrenciaPortal[]>({
    queryKey: ["portal-ocorrencias"],
    queryFn:  () => fetchJson(`${BASE}/api/portal/ocorrencias`),
  });

  const cienciaMut = useMutation({
    mutationFn: (id: string) => postJson(`${BASE}/api/portal/ocorrencias/${id}/ciencia`),
    onSuccess: () => {
      toast({ title: "Ciência registrada com sucesso." });
      qc.invalidateQueries({ queryKey: ["portal-ocorrencias"] });
    },
    onError:   (e: Error) => toast({ variant: "destructive", title: e.message }),
    onSettled: () => setConfirming(null),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Carregando...</p>;
  if (!ocorrencias.length) return (
    <p className="text-sm text-muted-foreground p-4">Nenhuma ocorrência registrada.</p>
  );

  return (
    <>
      <div className="flex flex-col gap-3">
        {ocorrencias.map((oc) => (
          <Card key={oc.id} className={oc.cienteEm ? "border-green-200 bg-green-50/30 dark:bg-green-950/10" : ""}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{oc.tipoOcorrenciaDescricao}</p>
                  <p className="text-xs text-muted-foreground">Data: {formatarData(oc.dataOcorrencia)}</p>
                  {oc.observacao && <p className="text-xs mt-1 text-muted-foreground">{oc.observacao}</p>}
                </div>
                {oc.cienteEm ? (
                  <Badge variant="secondary" className="flex-shrink-0 gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Ciente em {formatarData(oc.cienteEm)}
                  </Badge>
                ) : isMaior ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirming(oc)} className="flex-shrink-0">
                    Dar ciência
                  </Button>
                ) : (
                  <Badge variant="outline" className="flex-shrink-0 text-xs">Menor — visualização apenas</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ciência</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, você declara estar ciente da ocorrência:{" "}
              <strong>{confirming?.tipoOcorrenciaDescricao}</strong> em{" "}
              {formatarData(confirming?.dataOcorrencia ?? null)}. Esta ação não pode ser desfeita.
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

// ── Página principal ──────────────────────────────────────────────────────────

export default function PortalEstudantePage() {
  const { user } = useAuth();

  const { data: me, isLoading, isError } = useQuery<PortalMe>({
    queryKey: ["portal-me"],
    queryFn:  () => fetchJson(`${BASE}/api/portal/me`),
  });

  const { data: carteiras = [] } = useQuery<CarteiraDB[]>({
    queryKey: ["portal-carteiras"],
    queryFn:  () => fetchJson(`${BASE}/api/portal/carteiras`),
    enabled:  !!me,
  });

  // Carteira ativa do tipo 'carteira' (prioriza mais recente)
  const carteiraAtiva = carteiras
    .filter((c) => c.tipo === "carteira" && c.status === "ativa")
    .sort((a, b) => b.ano - a.ano || b.semestre - a.semestre)[0] ?? null;

  // Último registro do tipo 'cartao-semestral' (pode estar cancelado)
  const cartaoSemestral = carteiras
    .filter((c) => c.tipo === "cartao-semestral")
    .sort((a, b) => b.ano - a.ano || b.semestre - a.semestre)[0] ?? null;

  if (isLoading) return <p className="p-8 text-muted-foreground">Carregando...</p>;
  if (isError || !me) return (
    <div className="p-8 flex flex-col gap-2 items-center">
      <AlertTriangle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-destructive">Não foi possível carregar seus dados. Tente novamente.</p>
    </div>
  );

  const { usuario, matriculas, disciplinas } = me;
  const idade = calcularIdade(usuario.dataNascimento);

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Cabeçalho do perfil */}
      <div className="flex items-center gap-4">
        {usuario.fotoUrl ? (
          <img src={usuario.fotoUrl} alt="Foto" className="w-16 h-16 rounded-full object-cover border-2 border-primary/30" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{usuario.nome ?? "Estudante"}</h1>
          <p className="text-sm text-muted-foreground">Código: {usuario.codigoAcesso}</p>
          {usuario.dataNascimento && (
            <p className="text-xs text-muted-foreground">
              Nascimento: {formatarData(usuario.dataNascimento)}
              {idade !== null && ` (${idade} anos)`}
              {!usuario.isMaior && (
                <Badge variant="outline" className="ml-2 text-xs">Menor de idade</Badge>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Abas */}
      <Tabs defaultValue="matriculas">
        <TabsList className="w-full">
          <TabsTrigger value="matriculas" className="flex-1 gap-1.5">
            <BookOpen className="w-4 h-4" /> Minha enturmação
          </TabsTrigger>
          <TabsTrigger value="ocorrencias" className="flex-1 gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Ocorrências
          </TabsTrigger>
          <TabsTrigger value="documentos" className="flex-1 gap-1.5">
            <CreditCard className="w-4 h-4" /> Documentos
          </TabsTrigger>
        </TabsList>

        {/* Aba: Enturmação */}
        <TabsContent value="matriculas" className="flex flex-col gap-4 mt-4">
          {matriculas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma enturmação ativa.</p>
          ) : (
            matriculas.map((mat) => (
              <Card key={mat.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" />
                    {mat.cursoNome}
                    {mat.moduloMenor && <Badge variant="outline" className="text-xs">Módulo menor</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-muted-foreground text-xs">Turma:</span> {mat.turmaSigla}</div>
                  <div><span className="text-muted-foreground text-xs">Turno(s):</span> {mat.turnos.map((t) => t.nome).join(", ") || "—"}</div>
                  <div><span className="text-muted-foreground text-xs">Registro:</span> {mat.registro}</div>
                  <div><span className="text-muted-foreground text-xs">Período:</span> {mat.semestre}º sem. / {mat.ano}</div>
                </CardContent>
              </Card>
            ))
          )}

          {disciplinas.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Disciplinas cursadas</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {disciplinas.map((d) => (
                  <Badge key={d.disciplinaOfertaId} variant="secondary" className="text-xs">
                    {d.disciplinaNome} · {d.cursoNome} · {d.turnoNome}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Aba: Ocorrências */}
        <TabsContent value="ocorrencias" className="mt-4">
          {!usuario.isMaior && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded p-3 mb-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Você é menor de idade. Pode visualizar suas ocorrências, mas dar ciência é restrito a maiores de 18 anos.
            </div>
          )}
          <OcorrenciasTab isMaior={usuario.isMaior} />
        </TabsContent>

        {/* Aba: Documentos */}
        <TabsContent value="documentos" className="mt-4 flex flex-col gap-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Carteira de Estudante
              </h3>
              {carteiraAtiva && <StatusCarteiraBadge status={carteiraAtiva.status} />}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Documento válido para identificação estudantil e meia-entrada em eventos culturais e esportivos
              (Lei Federal 12.989/2014). Emitida automaticamente ao enturmar. Dados protegidos pela LGPD (Lei 13.709/2018).
            </p>
            <CarteiraEstudante me={me} carteira={carteiraAtiva} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Fingerprint className="w-4 h-4" /> Cartão de Liberação Semestral
              </h3>
              {cartaoSemestral && <StatusCarteiraBadge status={cartaoSemestral.status} />}
            </div>
            <CartaoLiberacao />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
