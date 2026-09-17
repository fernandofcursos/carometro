import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { HeartHandshake, Users, ClipboardList, Target, CalendarCheck, Lock } from "lucide-react";
import { EncaminhamentosTab } from "@/components/encaminhamentos-tab";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aberto: "default",
    em_acompanhamento: "outline",
    encerrado: "secondary",
    pendente: "secondary",
    em_atendimento: "outline",
    concluido: "default",
    arquivado: "secondary",
    agendado: "outline",
    realizado: "default",
    cancelado: "destructive",
  };
  return <Badge variant={(map[status] ?? "secondary") as any}>{status.replace(/_/g, " ")}</Badge>;
}

function RegistroAcesso({ atendimentoId }: { atendimentoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const { toast } = useToast();

  const { data, refetch } = useQuery({
    queryKey: ["soe-atendimento-completo", atendimentoId],
    queryFn: () => apiFetch(`/api/soe/atendimentos/${atendimentoId}`),
    enabled: false,
  });

  async function confirmarAcesso() {
    setConfirmado(true);
    await refetch();
    toast({ title: "Acesso registrado", description: "Este acesso foi registrado no log de auditoria conforme LGPD." });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Lock className="h-4 w-4 mr-1" /> Ver registro sigiloso
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); setConfirmado(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-amber-600" />
              Registro Sigiloso — Acesso Auditado
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todo acesso a registros sigilosos é registrado no log de auditoria conforme LGPD, ISO 27001 e normativos da SEDF.
          </p>
          {!confirmado && (
            <div className="border border-amber-300 bg-amber-50 rounded p-3 mt-2">
              <p className="text-sm font-medium text-amber-800">Confirmar acesso ao registro</p>
              <p className="text-xs text-amber-700 mt-1">
                Este acesso será registrado com sua identidade, data/hora e IP.
              </p>
              <Button size="sm" className="mt-2" onClick={confirmarAcesso}>
                Confirmar e visualizar
              </Button>
            </div>
          )}
          {confirmado && data?.registro && (
            <div className="border rounded p-3 mt-2 bg-muted/40">
              <p className="text-xs font-mono whitespace-pre-wrap">{data.registro}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SoeGestaoPage() {
  const [busca, setBusca] = useState("");
  const [estudanteSel, setEstudanteSel] = useState<{ id: string; nome: string } | null>(null);

  const { data: atendimentos } = useQuery({
    queryKey: ["soe-atendimentos"],
    queryFn: () => apiFetch("/api/soe/atendimentos"),
  });

  const { data: atendimentosEstudante } = useQuery({
    queryKey: ["soe-atendimentos-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/atendimentos?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const { data: encaminhamentos } = useQuery({
    queryKey: ["soe-encaminhamentos-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/encaminhamentos?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const { data: acoes } = useQuery({
    queryKey: ["soe-acoes-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/acoes?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const { data: estudos } = useQuery({
    queryKey: ["soe-estudos-estudante", estudanteSel?.id],
    queryFn: () => apiFetch(`/api/soe/estudos-de-caso?estudanteId=${estudanteSel!.id}`),
    enabled: !!estudanteSel,
  });

  const estudantesMap = new Map<string, { id: string; nome: string }>();
  for (const a of atendimentos?.atendimentos ?? []) {
    if (!estudantesMap.has(a.estudanteId)) {
      estudantesMap.set(a.estudanteId, { id: a.estudanteId, nome: a.estudanteId });
    }
  }
  const lista = [...estudantesMap.values()].filter(e =>
    !busca || e.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const totalAbertos = (atendimentos?.atendimentos ?? []).filter((a: any) => a.status === "aberto").length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-green-700" />
        <h1 className="text-2xl font-bold">Serviço de Orientação Educacional</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Atendimentos abertos", valor: totalAbertos, icon: Users },
          { label: "Encaminhamentos pendentes", valor: 0, icon: ClipboardList },
          { label: "Ações em andamento", valor: 0, icon: Target },
          { label: "Estudos de caso", valor: 0, icon: CalendarCheck },
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
              className={`cursor-pointer transition-colors ${estudanteSel?.id === est.id ? "border-green-600 bg-green-50/50" : ""}`}
              onClick={() => setEstudanteSel(est)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm">{est.nome}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {estudanteSel && (
          <div className="md:col-span-2">
            <Tabs defaultValue="atendimentos">
              <TabsList>
                <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
                <TabsTrigger value="encaminhamentos">Encaminhamentos</TabsTrigger>
                <TabsTrigger value="acoes">Ações</TabsTrigger>
                <TabsTrigger value="estudos">Estudo de Caso</TabsTrigger>
                <TabsTrigger value="inter-modulos">Inter-módulos</TabsTrigger>
              </TabsList>

              <TabsContent value="atendimentos" className="space-y-3 mt-3">
                {atendimentosEstudante?.atendimentos?.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{a.dataAtendimento} · {a.tipo}</p>
                        <p className="text-xs text-muted-foreground mt-1">{a.motivo}</p>
                        <div className="mt-2">
                          <RegistroAcesso atendimentoId={a.id} />
                        </div>
                      </div>
                      <StatusBadge status={a.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="encaminhamentos" className="space-y-3 mt-3">
                {encaminhamentos?.encaminhamentos?.map((e: any) => (
                  <Card key={e.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="text-sm">{e.motivo}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Prioridade: <span className={e.prioridade === "urgente" ? "text-red-600 font-semibold" : ""}>{e.prioridade}</span>
                        </p>
                      </div>
                      <StatusBadge status={e.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="acoes" className="space-y-3 mt-3">
                {acoes?.acoes?.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{a.titulo}</p>
                        {a.prazo && <p className="text-xs text-muted-foreground mt-1">Prazo: {a.prazo}</p>}
                      </div>
                      <StatusBadge status={a.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="estudos" className="space-y-3 mt-3">
                {estudos?.estudos?.map((e: any) => (
                  <Card key={e.id}>
                    <CardContent className="p-4 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{e.dataReuniao}</p>
                        {e.participantes && <p className="text-xs text-muted-foreground mt-1">{e.participantes}</p>}
                        {e.deliberacoes && <p className="text-xs mt-1">{e.deliberacoes}</p>}
                      </div>
                      <StatusBadge status={e.status} />
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
              <TabsContent value="inter-modulos" className="mt-3">
                <EncaminhamentosTab modulo="soe" />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
