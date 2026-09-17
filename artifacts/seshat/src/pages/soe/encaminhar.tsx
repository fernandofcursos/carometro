import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { HeartHandshake } from "lucide-react";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

export default function SoeEncaminharPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [estudanteId, setEstudanteId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [prioridade, setPrioridade] = useState<"normal" | "urgente">("normal");

  const { data: encaminhamentos } = useQuery({
    queryKey: ["soe-meus-encaminhamentos"],
    queryFn: () => apiFetch("/api/soe/encaminhamentos"),
  });

  const { data: minhasAcoes } = useQuery({
    queryKey: ["soe-minhas-acoes"],
    queryFn: () => apiFetch("/api/soe/acoes"),
  });

  const criar = useMutation({
    mutationFn: (body: object) => apiFetch("/api/soe/encaminhamentos", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => {
      toast({ title: "Encaminhamento criado", description: "A orientadora educacional foi notificada." });
      qc.invalidateQueries({ queryKey: ["soe-meus-encaminhamentos"] });
      setEstudanteId(""); setMotivo(""); setPrioridade("normal");
    },
    onError: (err: any) => toast({ title: "Erro", description: err?.error ?? "Erro ao encaminhar.", variant: "destructive" }),
  });

  const concluirAcao = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/soe/acoes/${id}/status`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "concluida" }),
    }),
    onSuccess: () => {
      toast({ title: "Ação concluída" });
      qc.invalidateQueries({ queryKey: ["soe-minhas-acoes"] });
    },
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!estudanteId || !motivo) return;
    criar.mutate({ estudanteId, motivo, prioridade });
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <HeartHandshake className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Encaminhamento ao SOE</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Novo encaminhamento</h2>
          <form onSubmit={enviar} className="space-y-3">
            <Input
              placeholder="ID do estudante (UUID)"
              value={estudanteId}
              onChange={e => setEstudanteId(e.target.value)}
              required
            />
            <Textarea
              placeholder="Descreva o motivo do encaminhamento..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={4}
              required
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant={prioridade === "normal" ? "default" : "outline"}
                size="sm"
                onClick={() => setPrioridade("normal")}
              >Normal</Button>
              <Button
                type="button"
                variant={prioridade === "urgente" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setPrioridade("urgente")}
              >Urgente</Button>
            </div>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Enviando..." : "Encaminhar ao SOE"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Meus encaminhamentos</h2>
      <div className="space-y-3">
        {(encaminhamentos?.encaminhamentos ?? []).map((e: any) => (
          <Card key={e.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm">{e.motivo}</p>
                <p className="text-xs text-muted-foreground mt-1">Prioridade: {e.prioridade}</p>
              </div>
              <Badge variant={e.status === "concluido" ? "default" : "secondary"}>
                {e.status.replace(/_/g, " ")}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold">Ações atribuídas a mim</h2>
      <div className="space-y-3">
        {(minhasAcoes?.acoes ?? []).map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">{a.titulo}</p>
                {a.prazo && <p className="text-xs text-muted-foreground">Prazo: {a.prazo}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={a.status === "concluida" ? "default" : "secondary"}>
                  {a.status.replace(/_/g, " ")}
                </Badge>
                {a.status !== "concluida" && (
                  <Button size="sm" variant="outline" onClick={() => concluirAcao.mutate(a.id)}>
                    Concluir
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
