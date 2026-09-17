import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart2 } from "lucide-react";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw body;
  return body;
}

const LAUDO_LABEL: Record<string, string> = {
  DI: "Deficiência Intelectual", DF: "Deficiência Física",
  DOWN: "Síndrome de Down", TEA: "TEA", AH_SD: "Altas Habilidades/SD",
};

export default function SalaRecursosAnalise() {
  const [filtroLaudo, setFiltroLaudo] = useState("todos");
  const [busca, setBusca] = useState("");

  const { data: eneesData } = useQuery({
    queryKey: ["sr-analise-enees"],
    queryFn: () => apiFetch("/api/sala-recursos/estudantes-enee"),
  });
  const { data: planosData } = useQuery({
    queryKey: ["sr-analise-planos"],
    queryFn: () => apiFetch("/api/sala-recursos/planos-aee"),
  });

  const enees: any[] = eneesData?.estudantes ?? [];
  const planos: any[] = planosData?.planos ?? [];

  const eneesAtivos = enees.filter(e => e.ativo);

  const kpis = [
    { label: "ENEEs Ativos",      value: eneesAtivos.length },
    { label: "Planos Ativos",     value: planos.filter(p => p.status === "ativo").length },
    { label: "Planos Rascunho",   value: planos.filter(p => p.status === "rascunho").length },
    { label: "Planos Encerrados", value: planos.filter(p => p.status === "encerrado").length },
  ];

  const filtrados = enees
    .filter(e => filtroLaudo === "todos" || e.laudo === filtroLaudo)
    .filter(e => !busca || (e.nome ?? "").toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-4 flex-shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BarChart2 className="h-5 w-5" /> Análise — Sala de Recursos
        </h1>
        <p className="text-sm text-muted-foreground">Visão gerencial de ENEEs, planos e encaminhamentos</p>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 flex-shrink-0">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-bold mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="px-4 pb-3 flex gap-3 flex-shrink-0">
        <Input placeholder="Buscar estudante..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs" />
        <Select value={filtroLaudo} onValueChange={setFiltroLaudo}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Filtrar por laudo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os laudos</SelectItem>
            {Object.entries(LAUDO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="border rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left px-4 py-3">Estudante</th>
                <th className="text-left px-4 py-3">Laudo</th>
                <th className="text-left px-4 py-3">Plano Ativo</th>
                <th className="text-left px-4 py-3">Prazo</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum resultado.</td></tr>
              )}
              {filtrados.map(e => {
                const plano = planos.find(p => p.estudanteId === e.id && p.status === "ativo");
                return (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{e.nome ?? e.usuarioId}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{e.laudo}</Badge></td>
                    <td className="px-4 py-3">{plano ? "Sim" : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3">{plano?.prazo ?? "—"}</td>
                    <td className="px-4 py-3">
                      {e.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
