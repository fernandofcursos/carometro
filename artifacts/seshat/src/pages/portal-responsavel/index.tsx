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
  LogOut, FileText, Upload, Download, Plus, X, Users,
} from "lucide-react";
import { AvisosWidget } from "@/components/avisos-widget";

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

// ── Aba: Cartão de Saída ──────────────────────────────────────────────────────

function CartaoSaidaTab({ estudanteId }: { estudanteId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [dataSaida, setDataSaida] = useState("");
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data: cartoes = [], isLoading } = useQuery<CartaoSaida[]>({
    queryKey: ["resp-cartoes-saida", estudanteId],
    queryFn:  () => fetchJson(`${BASE}/api/portal-responsavel/cartoes-saida/${estudanteId}`),
  });

  const solicitarMut = useMutation({
    mutationFn: () => postJson(`${BASE}/api/portal-responsavel/cartao-saida`, {
      estudanteId, dataSaida, horarioSaida: horario || undefined, motivo: motivo || undefined,
    }),
    onSuccess: () => {
      toast({ title: "Solicitação enviada com sucesso." });
      qc.invalidateQueries({ queryKey: ["resp-cartoes-saida", estudanteId] });
      setShowForm(false); setDataSaida(""); setHorario(""); setMotivo("");
    },
    onError: (e: Error) => toast({ variant: "destructive", title: e.message }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Solicite autorização para saída antecipada. O coordenador irá aprovar ou recusar.
        </p>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1 flex-shrink-0">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nova solicitação"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data de saída *</Label>
                <Input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Horário (opcional)</Label>
                <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} placeholder="Descreva o motivo da saída..." />
            </div>
            <Button onClick={() => solicitarMut.mutate()} disabled={!dataSaida || solicitarMut.isPending} size="sm">
              {solicitarMut.isPending ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p>
        : !cartoes.length ? <p className="text-sm text-muted-foreground">Nenhuma solicitação encontrada.</p>
        : cartoes.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">Saída em {fmt(c.dataSaida)}{c.horarioSaida ? ` às ${c.horarioSaida.substring(0, 5)}` : ""}</p>
                  {c.motivo && <p className="text-xs text-muted-foreground">{c.motivo}</p>}
                  {c.observacaoAprovador && (
                    <p className="text-xs text-muted-foreground mt-1 italic">Coordenador: {c.observacaoAprovador}</p>
                  )}
                </div>
                <StatusBadge status={c.status} />
              </div>
              {c.status === "aprovado" && c.token && (
                <div className="flex flex-col items-center gap-1 border-t pt-2 mt-1">
                  <p className="text-xs text-muted-foreground">Apresente o QR code na portaria</p>
                  <div className="bg-white p-1 rounded border">
                    <QrCodeCanvas
                      value={`${window.location.origin}${BASE}/verificar-saida/${c.token}`}
                      size={110}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      }
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
                      <LogOut className="w-3.5 h-3.5" /> Cartão de Saída
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
                    <CartaoSaidaTab estudanteId={est.id} />
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
    </div>
  );
}
