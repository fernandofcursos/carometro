import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye } from "lucide-react";

type Modulo = "sr" | "eeaa" | "soe";

const MODULO_LABEL: Record<Modulo, string> = {
  sr: "Sala de Recursos",
  eeaa: "EEAA",
  soe: "SOE",
};

const MODULOS_DESTINO: Record<Modulo, Modulo[]> = {
  sr:   ["eeaa", "soe"],
  eeaa: ["sr", "soe"],
  soe:  ["sr", "eeaa"],
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendente:     { label: "Pendente",     variant: "secondary" },
  aceito:       { label: "Aceito",       variant: "default" },
  em_andamento: { label: "Em andamento", variant: "outline" },
  devolvido:    { label: "Devolvido",    variant: "destructive" },
  resolvido:    { label: "Resolvido",    variant: "default" },
  arquivado:    { label: "Arquivado",    variant: "secondary" },
};

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

function apiMsg(err: any, fallback: string): string {
  return err?.data?.error ?? err?.error ?? fallback;
}

interface Enc {
  id: string;
  origemModulo: Modulo;
  destinoModulo: Modulo;
  estudanteId: string;
  mensagem: string;
  tipoDemanda?: string | null;
  cids?: string[] | null;
  status: string;
  resolucao?: string | null;
  paiId?: string | null;
  criadoEm: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

interface NovoEncModalProps {
  modulo: Modulo;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NovoEncModal({ modulo, open, onClose, onSuccess }: NovoEncModalProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    estudanteId: "", destinoModulo: "" as Modulo | "",
    mensagem: "", tipoDemanda: "", cids: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destinoModulo || !form.mensagem.trim() || !form.estudanteId.trim()) return;
    try {
      await apiFetch("/api/encaminhamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estudanteId: form.estudanteId,
          origemModulo: modulo,
          destinoModulo: form.destinoModulo,
          mensagem: form.mensagem,
          tipoDemanda: form.tipoDemanda || undefined,
          cids: form.cids ? form.cids.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        }),
      });
      toast({ title: "Encaminhamento criado." });
      setForm({ estudanteId: "", destinoModulo: "", mensagem: "", tipoDemanda: "", cids: "" });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro", description: apiMsg(err, "Falha ao criar encaminhamento."), variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo Encaminhamento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>ID do Estudante</Label>
            <Input value={form.estudanteId} onChange={e => setForm(f => ({ ...f, estudanteId: e.target.value }))}
              placeholder="UUID do estudante" required />
          </div>
          <div>
            <Label>Destino</Label>
            <Select value={form.destinoModulo} onValueChange={v => setForm(f => ({ ...f, destinoModulo: v as Modulo }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar módulo..." /></SelectTrigger>
              <SelectContent>
                {MODULOS_DESTINO[modulo].map(m => (
                  <SelectItem key={m} value={m}>{MODULO_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo</Label>
            <Textarea value={form.mensagem} onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))}
              placeholder="Descreva o motivo do encaminhamento..." rows={3} required />
          </div>
          <div>
            <Label>Tipo de demanda <span className="text-muted-foreground">(opcional)</span></Label>
            <Input value={form.tipoDemanda} onChange={e => setForm(f => ({ ...f, tipoDemanda: e.target.value }))}
              placeholder="Ex: TDAH, Dislexia..." />
          </div>
          <div>
            <Label>CIDs <span className="text-muted-foreground">(opcional, separados por vírgula)</span></Label>
            <Input value={form.cids} onChange={e => setForm(f => ({ ...f, cids: e.target.value }))}
              placeholder="Ex: F90.0, F81.0" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Encaminhar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AcaoModalProps {
  enc: Enc | null;
  modulo: Modulo;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AcaoModal({ enc, modulo, open, onClose, onSuccess }: AcaoModalProps) {
  const { toast } = useToast();
  const [resolucao, setResolucao] = useState("");
  const [reencDest, setReencDest] = useState<Modulo | "">("");
  const [reencMsg, setReencMsg] = useState("");
  const [acao, setAcao] = useState<"aceitar" | "resolver" | "devolver" | "reencaminhar" | null>(null);

  if (!enc) return null;

  async function executar() {
    if (!enc || !acao) return;
    try {
      if (acao === "aceitar") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/aceitar`, { method: "PUT" });
      } else if (acao === "resolver") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/resolver`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolucao }),
        });
      } else if (acao === "devolver") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/devolver`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolucao }),
        });
      } else if (acao === "reencaminhar") {
        await apiFetch(`/api/encaminhamentos/${enc.id}/reencaminhar`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinoModulo: reencDest, mensagem: reencMsg }),
        });
      }
      toast({ title: "Ação realizada com sucesso." });
      setAcao(null); setResolucao(""); setReencDest(""); setReencMsg("");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Erro", description: apiMsg(err, "Falha ao executar ação."), variant: "destructive" });
    }
  }

  const podeAceitar  = enc.destinoModulo === modulo && enc.status === "pendente";
  const podeResolver = enc.destinoModulo === modulo && ["aceito", "em_andamento"].includes(enc.status);
  const podeDevolver = enc.destinoModulo === modulo && ["pendente", "aceito", "em_andamento"].includes(enc.status);
  const podeReenc    = enc.destinoModulo === modulo && ["pendente", "aceito", "em_andamento"].includes(enc.status);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Encaminhamento — {MODULO_LABEL[enc.origemModulo]} → {MODULO_LABEL[enc.destinoModulo]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge status={enc.status} />
            {enc.tipoDemanda && <Badge variant="outline">{enc.tipoDemanda}</Badge>}
            {enc.cids?.map(c => <Badge key={c} variant="outline" className="font-mono">{c}</Badge>)}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Motivo</p>
            <p>{enc.mensagem}</p>
          </div>
          {enc.resolucao && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-0.5">Resolução/Devolução</p>
              <p>{enc.resolucao}</p>
            </div>
          )}
          {enc.paiId && (
            <p className="text-xs text-muted-foreground">Re-encaminhamento (pai: {enc.paiId.slice(0, 8)}…)</p>
          )}
        </div>

        {(podeAceitar || podeResolver || podeDevolver || podeReenc) && (
          <div className="border-t pt-3 space-y-3">
            {!acao && (
              <div className="flex flex-wrap gap-2">
                {podeAceitar  && <Button size="sm" onClick={() => setAcao("aceitar")}>Aceitar</Button>}
                {podeResolver && <Button size="sm" variant="outline" onClick={() => setAcao("resolver")}>Resolver</Button>}
                {podeDevolver && <Button size="sm" variant="outline" onClick={() => setAcao("devolver")}>Devolver</Button>}
                {podeReenc    && <Button size="sm" variant="outline" onClick={() => setAcao("reencaminhar")}>Re-encaminhar</Button>}
              </div>
            )}
            {acao === "aceitar" && (
              <div className="space-y-2">
                <p className="text-sm">Confirmar aceitação do encaminhamento?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={executar}>Confirmar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {(acao === "resolver" || acao === "devolver") && (
              <div className="space-y-2">
                <Label>{acao === "resolver" ? "Resolução" : "Motivo da devolução"}</Label>
                <Textarea value={resolucao} onChange={e => setResolucao(e.target.value)} rows={3} required />
                <div className="flex gap-2">
                  <Button size="sm" onClick={executar} disabled={!resolucao.trim()}>Confirmar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {acao === "reencaminhar" && (
              <div className="space-y-2">
                <div>
                  <Label>Destino</Label>
                  <Select value={reencDest} onValueChange={v => setReencDest(v as Modulo)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {MODULOS_DESTINO[modulo].filter(m => m !== enc.origemModulo).map(m => (
                        <SelectItem key={m} value={m}>{MODULO_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mensagem</Label>
                  <Textarea value={reencMsg} onChange={e => setReencMsg(e.target.value)} rows={2} required />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={executar} disabled={!reencDest || !reencMsg.trim()}>Encaminhar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAcao(null)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EncaminhamentosTabProps {
  modulo: Modulo;
}

export function EncaminhamentosTab({ modulo }: EncaminhamentosTabProps) {
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<Enc | null>(null);

  const { data: recData } = useQuery({
    queryKey: ["enc-recebidos", modulo],
    queryFn: () => apiFetch(`/api/encaminhamentos?caixa=recebidos&modulo=${modulo}`),
    refetchInterval: 60_000,
  });
  const { data: envData } = useQuery({
    queryKey: ["enc-enviados", modulo],
    queryFn: () => apiFetch(`/api/encaminhamentos?caixa=enviados&modulo=${modulo}`),
    refetchInterval: 60_000,
  });

  const recebidos: Enc[] = recData?.encaminhamentos ?? [];
  const enviados:  Enc[] = envData?.encaminhamentos ?? [];

  function refresh() {
    qc.invalidateQueries({ queryKey: ["enc-recebidos", modulo] });
    qc.invalidateQueries({ queryKey: ["enc-enviados", modulo] });
  }

  function EncRow({ enc, showOrigem }: { enc: Enc; showOrigem: boolean }) {
    return (
      <div
        className="flex items-start justify-between p-3 border rounded-lg bg-white hover:bg-muted/30 cursor-pointer"
        onClick={() => setDetalhe(enc)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{enc.mensagem}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">
              {showOrigem ? `De: ${MODULO_LABEL[enc.origemModulo]}` : `Para: ${MODULO_LABEL[enc.destinoModulo]}`}
            </span>
            {enc.tipoDemanda && <Badge variant="outline" className="text-xs">{enc.tipoDemanda}</Badge>}
            {enc.cids?.slice(0, 2).map(c => <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>)}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <StatusBadge status={enc.status} />
          <Eye className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo encaminhamento
        </Button>
      </div>

      <Tabs defaultValue="recebidos">
        <TabsList>
          <TabsTrigger value="recebidos">Recebidos ({recebidos.length})</TabsTrigger>
          <TabsTrigger value="enviados">Enviados ({enviados.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="recebidos" className="space-y-2 mt-3">
          {recebidos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum encaminhamento recebido.</p>
          )}
          {recebidos.map(e => <EncRow key={e.id} enc={e} showOrigem />)}
        </TabsContent>
        <TabsContent value="enviados" className="space-y-2 mt-3">
          {enviados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum encaminhamento enviado.</p>
          )}
          {enviados.map(e => <EncRow key={e.id} enc={e} showOrigem={false} />)}
        </TabsContent>
      </Tabs>

      <NovoEncModal
        modulo={modulo}
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        onSuccess={refresh}
      />
      <AcaoModal
        enc={detalhe}
        modulo={modulo}
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        onSuccess={refresh}
      />
    </div>
  );
}
