import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Users, BookOpen, Heart, ClipboardList, Plus, Send } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

const LAUDO_LABEL: Record<string, string> = {
  DI: "Deficiência Intelectual",
  DF: "Deficiência Física",
  DOWN: "Síndrome de Down",
  TEA: "TEA",
  AH_SD: "Altas Habilidades/SD",
};

const LAUDO_COLOR: Record<string, string> = {
  DI:    "bg-blue-100 text-blue-800",
  DF:    "bg-purple-100 text-purple-800",
  DOWN:  "bg-green-100 text-green-800",
  TEA:   "bg-amber-100 text-amber-800",
  AH_SD: "bg-rose-100 text-rose-800",
};

const TIPO_ATENDIMENTO: Record<string, string> = {
  individual:            "Individual",
  orientacao_professor:  "Orient. Professor",
  orientacao_familia:    "Orient. Família",
  esv:                   "ESV",
  estudo_caso:           "Estudo de Caso",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho:     "secondary",
    ativo:        "default",
    encerrado:    "outline",
    aberto:       "default",
    pendente:     "secondary",
    em_andamento: "outline",
    concluido:    "default",
  };
  return <Badge variant={(map[status] ?? "secondary") as any}>{status.replace(/_/g, " ")}</Badge>;
}

function NovoAtendimentoModal({ estudanteId, onClose, onSave }: {
  estudanteId: string; onClose: () => void; onSave: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    dataAtendimento: new Date().toISOString().substring(0, 10),
    tipo: "individual",
    duracaoMin: "",
    narrativa: "",
  });

  async function salvar() {
    try {
      await apiFetch("/api/sala-recursos/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estudanteId,
          ...form,
          duracaoMin: form.duracaoMin ? Number(form.duracaoMin) : undefined,
        }),
      });
      toast({ title: "Atendimento registrado." });
      onSave();
      onClose();
    } catch {
      toast({ title: "Erro ao salvar atendimento.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo Atendimento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={form.dataAtendimento}
                onChange={e => setForm(f => ({ ...f, dataAtendimento: e.target.value }))} />
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input type="number" placeholder="50" value={form.duracaoMin}
                onChange={e => setForm(f => ({ ...f, duracaoMin: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_ATENDIMENTO).map(([v, l]) =>
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Narrativa</Label>
            <Textarea rows={4} placeholder="Relato da sessão..."
              value={form.narrativa}
              onChange={e => setForm(f => ({ ...f, narrativa: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EncaminharModal({ estudanteId, onClose }: { estudanteId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [destino, setDestino] = useState("soe");
  const [mensagem, setMensagem] = useState("");

  async function enviar() {
    try {
      await apiFetch("/api/sala-recursos/encaminhamentos/inter-modulo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinoModulo: destino, estudanteId, mensagem }),
      });
      toast({ title: "Encaminhamento enviado." });
      onClose();
    } catch {
      toast({ title: "Erro ao encaminhar.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Encaminhar para outro módulo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Destino</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="soe">SOE — Serviço de Orientação Educacional</SelectItem>
                <SelectItem value="aee">AEE — Coordenação de AEE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea rows={3} placeholder="Descreva o motivo do encaminhamento..."
              value={mensagem} onChange={e => setMensagem(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={!mensagem.trim()}>Encaminhar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalaRecursosGestao() {
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [novoAtendimento, setNovoAtendimento] = useState(false);
  const [encaminhar, setEncaminhar] = useState(false);

  const { data: eneesData } = useQuery({
    queryKey: ["sr-enees"],
    queryFn: () => apiFetch("/api/sala-recursos/estudantes-enee"),
  });
  const enees: any[] = eneesData?.estudantes ?? [];
  const filtrados = enees.filter(e =>
    !busca || (e.nome ?? "").toLowerCase().includes(busca.toLowerCase()) || e.laudo?.includes(busca.toUpperCase())
  );
  const selected = enees.find(e => e.id === selectedId) ?? filtrados[0] ?? null;

  const { data: atData, refetch: refetchAt } = useQuery({
    queryKey: ["sr-atendimentos", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/atendimentos?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: planosData } = useQuery({
    queryKey: ["sr-planos", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/planos-aee?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: esvData } = useQuery({
    queryKey: ["sr-esv", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/esv?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: ecData } = useQuery({
    queryKey: ["sr-estudos-caso", selected?.id],
    queryFn: () => apiFetch(`/api/sala-recursos/estudos-caso?estudanteId=${selected?.id}`),
    enabled: !!selected,
  });
  const { data: encData } = useQuery({
    queryKey: ["sr-encaminhamentos"],
    queryFn: () => apiFetch(`/api/sala-recursos/encaminhamentos`),
    enabled: !!selected,
  });

  const kpis = [
    { label: "ENEEs Ativos",        value: enees.filter(e => e.ativo).length, icon: Users,         color: "text-blue-600" },
    { label: "Atendimentos no Mês", value: "—",                               icon: BookOpen,       color: "text-green-600" },
    { label: "Planos AEE Ativos",   value: "—",                               icon: ClipboardList,  color: "text-amber-600" },
    { label: "Estudos de Caso",     value: "—",                               icon: Heart,          color: "text-rose-600" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <GraduationCap className="h-5 w-5" /> AEE — Sala de Recursos
          </h1>
          <p className="text-sm text-muted-foreground">Gestão de ENEEs, planos de AEE e atendimentos</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 flex-shrink-0">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-4 px-4 pb-4 flex-1 min-h-0 overflow-hidden">
        <div className="w-60 flex-shrink-0 flex flex-col gap-2">
          <Input placeholder="Buscar ENEE..." value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="flex-1 overflow-y-auto space-y-2">
            {filtrados.map(e => (
              <div key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  selected?.id === e.id ? "border-green-500 bg-green-50/50" : "border-border hover:border-primary"
                }`}
              >
                <p className="font-medium text-sm">{e.nome ?? e.usuarioId}</p>
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${LAUDO_COLOR[e.laudo] ?? "bg-gray-100 text-gray-800"}`}>
                  {LAUDO_LABEL[e.laudo] ?? e.laudo}
                </span>
              </div>
            ))}
            {filtrados.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum ENEE encontrado.</p>
            )}
          </div>
        </div>

        {selected ? (
          <div className="flex-1 min-w-0 border rounded-lg bg-white flex flex-col overflow-hidden">
            <div className="px-5 pt-4 border-b flex-shrink-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-bold text-base">{selected.nome ?? selected.usuarioId}</h2>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${LAUDO_COLOR[selected.laudo] ?? ""}`}>
                    {LAUDO_LABEL[selected.laudo] ?? selected.laudo}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEncaminhar(true)}>
                    <Send className="h-3.5 w-3.5 mr-1" /> Encaminhar
                  </Button>
                  <Button size="sm" onClick={() => setNovoAtendimento(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Atendimento
                  </Button>
                </div>
              </div>
              <Tabs defaultValue="atendimentos">
                <TabsList>
                  <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
                  <TabsTrigger value="plano">Plano de AEE</TabsTrigger>
                  <TabsTrigger value="esv">ESV</TabsTrigger>
                  <TabsTrigger value="estudo">Estudo de Caso</TabsTrigger>
                  <TabsTrigger value="encaminhamentos">Encaminhamentos</TabsTrigger>
                </TabsList>

                <div className="overflow-y-auto p-4">
                  <TabsContent value="atendimentos" className="mt-0 space-y-3">
                    {(atData?.atendimentos ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
                      : (atData?.atendimentos ?? []).map((a: any) => (
                        <div key={a.id} className="border rounded-lg p-3">
                          <span className="text-xs font-semibold text-muted-foreground uppercase">
                            {TIPO_ATENDIMENTO[a.tipo] ?? a.tipo}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.dataAtendimento}{a.duracaoMin ? ` · ${a.duracaoMin} min` : ""}
                          </p>
                          {a.narrativa && <p className="text-sm mt-2">{a.narrativa}</p>}
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="plano" className="mt-0 space-y-3">
                    {(planosData?.planos ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum plano de AEE.</p>
                      : (planosData?.planos ?? []).map((p: any) => (
                        <div key={p.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={p.status} />
                              <span className="text-xs text-muted-foreground">Prazo: {p.prazo}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{p.ano}/{p.semestre}º sem.</span>
                          </div>
                          <div className="grid gap-2 text-sm">
                            <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Objetivos</p><p>{p.objetivos}</p></div>
                            <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Estratégias</p><p>{p.estrategias}</p></div>
                            <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Avaliação</p><p>{p.avaliacao}</p></div>
                            {p.observacoes && <div><p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Observações</p><p>{p.observacoes}</p></div>}
                          </div>
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="esv" className="mt-0 space-y-3">
                    {(esvData?.esv ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum ESV vinculado.</p>
                      : (esvData?.esv ?? []).map((e: any) => (
                        <div key={e.id} className="border rounded-lg p-3">
                          <p className="font-medium text-sm">{e.nome}</p>
                          {e.contato && <p className="text-xs text-muted-foreground mt-0.5">{e.contato}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {e.periodoInicio}{e.periodoFim ? ` → ${e.periodoFim}` : " · em curso"}
                          </p>
                          {e.observacoes && <p className="text-sm mt-2">{e.observacoes}</p>}
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="estudo" className="mt-0 space-y-3">
                    {(ecData?.estudosCaso ?? []).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum estudo de caso.</p>
                      : (ecData?.estudosCaso ?? []).map((ec: any) => (
                        <div key={ec.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-muted-foreground">{ec.dataRealizacao}</span>
                            <StatusBadge status={ec.status} />
                          </div>
                          {ec.participantes && <p className="text-xs text-muted-foreground mb-1">Participantes: {ec.participantes}</p>}
                          <p className="text-sm">{ec.sintese}</p>
                          {ec.encaminhamentosResultantes && (
                            <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{ec.encaminhamentosResultantes}</p>
                          )}
                        </div>
                      ))
                    }
                  </TabsContent>

                  <TabsContent value="encaminhamentos" className="mt-0 space-y-3">
                    {(encData?.encaminhamentos ?? []).filter((enc: any) => enc.estudanteId === selected?.id).length === 0
                      ? <p className="text-sm text-muted-foreground">Nenhum encaminhamento.</p>
                      : (encData?.encaminhamentos ?? []).filter((enc: any) => enc.estudanteId === selected?.id).map((enc: any) => (
                        <div key={enc.id} className="border rounded-lg p-3">
                          <div className="flex justify-between items-center mb-1">
                            <StatusBadge status={enc.status} />
                            {enc.prazo && <span className="text-xs text-muted-foreground">Prazo: {enc.prazo}</span>}
                          </div>
                          <p className="text-sm">{enc.descricao}</p>
                          {enc.resposta && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">Resposta: {enc.resposta}</p>}
                        </div>
                      ))
                    }
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Selecione um ENEE para ver os detalhes.
          </div>
        )}
      </div>

      {novoAtendimento && selected && (
        <NovoAtendimentoModal
          estudanteId={selected.id}
          onClose={() => setNovoAtendimento(false)}
          onSave={() => refetchAt()}
        />
      )}
      {encaminhar && selected && (
        <EncaminharModal estudanteId={selected.id} onClose={() => setEncaminhar(false)} />
      )}
    </div>
  );
}
