import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Users, FileText, Target, ClipboardList, Lock } from "lucide-react";
import { EncaminhamentosTab } from "@/components/encaminhamentos-tab";

interface EstudanteEeaa {
  id: string; usuarioId: string; nomeEstudante: string | null;
  necessidades: string | null; ativo: boolean;
}

interface Plano {
  id: string; numero: string; status: string;
  periodoInicio: string | null; periodoFim: string | null; objetivosGerais: string | null;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho: "secondary", aguardando_assinatura: "outline",
    vigente: "default", encerrado: "destructive",
  };
  return <Badge variant={(map[status] ?? "secondary") as any}>{status.replace("_", " ")}</Badge>;
}

function LaudoAcesso({ estudanteEeaaId }: { estudanteEeaaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [laudoId, setLaudoId] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: ["eeaa-laudos", estudanteEeaaId],
    queryFn: () => apiFetch(`/api/eeaa/laudos?estudanteEeaaId=${estudanteEeaaId}`),
    enabled: aberto,
  });

  const { data: laudoCompleto, refetch } = useQuery({
    queryKey: ["eeaa-laudo-completo", laudoId],
    queryFn: () => apiFetch(`/api/eeaa/laudos/${laudoId}`),
    enabled: false,
  });

  function abrirLaudo(id: string) {
    setLaudoId(id);
    setConfirmado(false);
  }

  async function confirmarAcesso() {
    setConfirmado(true);
    await refetch();
    toast({ title: "Acesso registrado", description: "Este acesso foi registrado no log de auditoria." });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Lock className="h-4 w-4 mr-1" /> Laudos
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Laudos — Acesso Restrito (Auditado)
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todo acesso a laudos é registrado no log de auditoria conforme LGPD e ISO 27001.
          </p>
          <div className="space-y-2 mt-2">
            {data?.laudos?.map((l: any) => (
              <div key={l.id} className="border rounded p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{l.titulo}</p>
                  <p className="text-xs text-muted-foreground">{l.tipo} · {l.dataLaudo ?? "sem data"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => abrirLaudo(l.id)}>Ver</Button>
              </div>
            ))}
          </div>
          {laudoId && !confirmado && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 mt-2">
              <p className="text-sm font-medium text-amber-800">Confirmar acesso ao laudo</p>
              <p className="text-xs text-amber-700 mt-1">
                Este acesso será registrado com sua identidade, data/hora e IP.
              </p>
              <Button size="sm" className="mt-2" onClick={confirmarAcesso}>
                Confirmar e visualizar
              </Button>
            </div>
          )}
          {confirmado && laudoCompleto && (
            <div className="border rounded p-3 mt-2 bg-muted/40">
              <p className="text-xs font-mono whitespace-pre-wrap">{laudoCompleto.conteudo}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EeaaGestaoPage() {
  const [busca, setBusca] = useState("");
  const [estudanteSel, setEstudanteSel] = useState<EstudanteEeaa | null>(null);

  const { data: estudantes } = useQuery<{ estudantes: EstudanteEeaa[] }>({
    queryKey: ["eeaa-estudantes"],
    queryFn: () => apiFetch("/api/eeaa/estudantes"),
  });

  const { data: planos } = useQuery<{ planos: Plano[] }>({
    queryKey: ["eeaa-planos", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/eeaa/planos?estudanteEeaaId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const lista = (estudantes?.estudantes ?? []).filter(e =>
    !busca || e.nomeEstudante?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Equipe Especializada de Apoio à Aprendizagem</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Estudantes EEAA", valor: lista.length, icon: Users },
          { label: "PAIs vigentes", valor: 0, icon: FileText },
          { label: "Sessões este mês", valor: 0, icon: ClipboardList },
          { label: "Metas ativas", valor: 0, icon: Target },
        ].map(({ label, valor, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{valor}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <Input placeholder="Buscar estudante..." value={busca} onChange={e => setBusca(e.target.value)} />
          {lista.map(est => (
            <Card
              key={est.id}
              className={`cursor-pointer transition-colors ${estudanteSel?.id === est.id ? "border-blue-500 bg-blue-50/50" : ""}`}
              onClick={() => setEstudanteSel(est)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm">{est.nomeEstudante ?? "—"}</p>
                {est.necessidades && <p className="text-xs text-muted-foreground truncate">{est.necessidades}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        {estudanteSel && (
          <div className="md:col-span-2">
            <Tabs defaultValue="planos">
              <TabsList>
                <TabsTrigger value="planos">PAI</TabsTrigger>
                <TabsTrigger value="sessoes">Sessões</TabsTrigger>
                <TabsTrigger value="metas">Metas</TabsTrigger>
                <TabsTrigger value="laudos">Laudos</TabsTrigger>
                <TabsTrigger value="liberacoes">Liberações</TabsTrigger>
                <TabsTrigger value="inter-modulos">Inter-módulos</TabsTrigger>
              </TabsList>

              <TabsContent value="planos" className="space-y-3 mt-3">
                {planos?.planos?.map(p => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{p.numero}</p>
                        <p className="text-sm text-muted-foreground">
                          {p.periodoInicio} → {p.periodoFim ?? "em aberto"}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="laudos" className="mt-3">
                <LaudoAcesso estudanteEeaaId={estudanteSel.id} />
              </TabsContent>

              <TabsContent value="sessoes" className="mt-3">
                <p className="text-sm text-muted-foreground">Sessões em implementação.</p>
              </TabsContent>
              <TabsContent value="metas" className="mt-3">
                <p className="text-sm text-muted-foreground">Metas em implementação.</p>
              </TabsContent>
              <TabsContent value="liberacoes" className="mt-3">
                <p className="text-sm text-muted-foreground">Liberações em implementação.</p>
              </TabsContent>
              <TabsContent value="inter-modulos" className="mt-3">
                <EncaminhamentosTab modulo="eeaa" />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
