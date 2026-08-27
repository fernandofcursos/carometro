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

type CarteiraData = { token: string; validade: string };

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

// ── Carteira de Estudante ─────────────────────────────────────────────────────
// Segue: Lei 12.989/2014, SEEDF, LGPD art. 6º (finalidade e necessidade), ISO 27001 A.9.4

function CarteiraEstudante({ me }: { me: PortalMe }) {
  const { data } = useQuery<CarteiraData>({
    queryKey: ["portal-carteira"],
    queryFn:  () => fetchJson(`${BASE}/api/portal/carteira`),
  });

  const verUrl = data ? `${window.location.origin}${BASE}/verificar/${data.token}` : "";
  const primeiraMatricula = me.matriculas[0];

  return (
    <div className="flex flex-col items-center gap-4">
      <Card className="w-full max-w-sm bg-gradient-to-br from-blue-700 to-blue-900 text-white shadow-xl print:shadow-none">
        <CardContent className="p-5 flex flex-col gap-3">
          {/* Cabeçalho institucional */}
          <div className="flex items-center gap-2 border-b border-blue-500 pb-2">
            <GraduationCap className="w-5 h-5 flex-shrink-0" />
            <div className="text-xs font-semibold leading-tight">
              Secretaria de Estado de Educação do Distrito Federal
            </div>
          </div>

          {/* Foto + dados */}
          <div className="flex gap-3 items-start">
            {me.usuario.fotoUrl ? (
              <img
                src={me.usuario.fotoUrl}
                alt="Foto do estudante"
                className="w-20 h-24 object-cover rounded border-2 border-blue-400 flex-shrink-0"
              />
            ) : (
              <div className="w-20 h-24 bg-blue-600 rounded border-2 border-blue-400 flex items-center justify-center flex-shrink-0">
                <UserCircle className="w-10 h-10 text-blue-300" />
              </div>
            )}

            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-[10px] text-blue-300 uppercase tracking-wider">Estudante</p>
              <p className="font-bold text-sm leading-snug break-words">{me.usuario.nome ?? "—"}</p>
              {primeiraMatricula && (
                <>
                  <p className="text-xs text-blue-200">{primeiraMatricula.cursoNome}</p>
                  <p className="text-xs text-blue-300">
                    {primeiraMatricula.turnos.map((t) => t.nome).join(" / ")} — Turma {primeiraMatricula.turmaSigla}
                  </p>
                  <p className="text-xs text-blue-300">Matrícula: {primeiraMatricula.registro}</p>
                </>
              )}
            </div>
          </div>

          {/* Validade */}
          <div className="flex justify-between items-center text-xs border-t border-blue-500 pt-2">
            <span className="text-blue-300">Validade:</span>
            <span className="font-semibold">{data?.validade ?? "—"}</span>
          </div>

          {/* QR Code */}
          {data && (
            <div className="flex flex-col items-center gap-1 mt-1">
              <div className="bg-white p-1.5 rounded">
                <QrCodeCanvas value={verUrl} size={100} />
              </div>
              <p className="text-[9px] text-blue-400 text-center">Escaneie para verificar a autenticidade</p>
            </div>
          )}

          {/* Rodapé LGPD */}
          <p className="text-[8px] text-blue-400 text-center border-t border-blue-500 pt-2 leading-snug">
            Dados protegidos nos termos da LGPD (Lei 13.709/2018) e ISO 27001.
            Uso exclusivo para fins educacionais e de identificação estudantil.
          </p>
        </CardContent>
      </Card>

      {data && (
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Imprimir carteira
        </Button>
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
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Carteira de Estudante
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Documento válido para identificação estudantil, meia-entrada em eventos culturais e esportivos
              (Lei Federal 12.989/2014) e demais benefícios previstos na legislação do Distrito Federal.
              Dados protegidos pela LGPD (Lei 13.709/2018).
            </p>
            <CarteiraEstudante me={me} />
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Fingerprint className="w-4 h-4" /> Cartão de Liberação
            </h3>
            <CartaoLiberacao />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
