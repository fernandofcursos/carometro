/**
 * CardapioWidget — grade Seg–Sex reutilizável para todos os dashboards.
 *
 * Modos:
 *   editavel=false (padrão) — leitura, sem botões de ação
 *   editavel=true           — permite adicionar/editar/excluir (apenas Avisos page)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Utensils, ChevronLeft, ChevronRight, Plus, Pencil, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { credentials: "include", ...opts });

// ── Helpers ───────────────────────────────────────────────────────────────────

function segundaFeira(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function semanaLabel(seg: Date): string {
  const sex = new Date(seg); sex.setDate(seg.getDate() + 4);
  const fmt = (d: Date) =>
    `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  return `${fmt(seg)} – ${fmt(sex)}`;
}

const DIAS_FULL  = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const DIAS_ABREV = ["Seg",     "Ter",   "Qua",    "Qui",    "Sex"];

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CardapioAviso = {
  id: string; titulo: string; conteudo: string;
  dataInicio: string | null; tipoEhCardapio: boolean;
};

// ── Props ─────────────────────────────────────────────────────────────────────

type CardapioWidgetProps = {
  /** Modo editável: mostra botões adicionar/editar/excluir */
  editavel?: boolean;
  /** Callback para abrir dialog de edição (requerido quando editavel=true) */
  onEdit?: (a: CardapioAviso) => void;
  /** Callback para abrir dialog de criação (requerido quando editavel=true) */
  onAdd?: (data: string) => void;
  /** Callback de exclusão (requerido quando editavel=true) */
  onDelete?: (id: string) => void;
  /** Classe extra no Card raiz */
  className?: string;
};

// ── Componente ────────────────────────────────────────────────────────────────

export function CardapioWidget({
  editavel = false, onEdit, onAdd, onDelete, className,
}: CardapioWidgetProps) {
  const hoje = new Date();
  const [seg, setSeg] = useState<Date>(() => segundaFeira(hoje));

  // Mês da semana exibida — para buscar avisos do mês certo
  const mes = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, "0")}`;

  const { data: avisos = [], isLoading } = useQuery<CardapioAviso[]>({
    queryKey: ["cardapio-widget", mes],
    queryFn: async () => {
      const r = await api(`/api/avisos-informes/avisos?mes=${mes}`);
      if (!r.ok) return [];
      const all: CardapioAviso[] = await r.json();
      return all.filter((a) => a.tipoEhCardapio);
    },
    staleTime: 60_000,
  });

  const diasDatas = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(seg);
    d.setDate(seg.getDate() + i);
    return { iso: isoDate(d), d };
  });

  const avisosNoDia = (iso: string) => avisos.filter((a) => a.dataInicio === iso);
  const hojeIso = isoDate(hoje);

  const irParaHoje = () => setSeg(segundaFeira(hoje));
  const semanaAnterior = () => setSeg((s) => { const d = new Date(s); d.setDate(d.getDate() - 7); return d; });
  const proximaSemana = () => setSeg((s) => { const d = new Date(s); d.setDate(d.getDate() + 7); return d; });

  const ehSemanaAtual = isoDate(seg) === isoDate(segundaFeira(hoje));

  return (
    <Card className={cn(
      "shadow-sm border-orange-200/60 dark:border-orange-900/40",
      className
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Utensils className="w-4 h-4 text-orange-500" />
            Cardápio Semanal
          </CardTitle>

          {/* Navegação por semana */}
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={semanaAnterior}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-semibold text-muted-foreground min-w-[110px] text-center tabular-nums">
              {semanaLabel(seg)}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={proximaSemana}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {!ehSemanaAtual && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2"
                onClick={irParaHoje}>
                Hoje
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          // Skeleton
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[90px] rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* ── Desktop: grade 5 colunas ── */}
            <div className="hidden sm:grid grid-cols-5 gap-2">
              {diasDatas.map(({ iso, d }, i) => {
                const itens = avisosNoDia(iso);
                const isHoje = iso === hojeIso;
                return (
                  <div key={iso} className={cn(
                    "border rounded-xl p-2 min-h-[100px] flex flex-col transition-colors",
                    isHoje
                      ? "border-orange-400/70 bg-gradient-to-b from-orange-50 to-orange-50/40 dark:from-orange-950/25 dark:to-orange-950/10"
                      : "border-border/50 bg-muted/10 hover:bg-muted/20"
                  )}>
                    {/* Cabeçalho do dia */}
                    <div className={cn(
                      "text-[11px] font-bold pb-1 mb-1.5 border-b flex items-center justify-between",
                      isHoje
                        ? "text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-800"
                        : "text-muted-foreground border-border/40"
                    )}>
                      <span>{DIAS_FULL[i]}</span>
                      <span className={cn(
                        "font-normal ml-1",
                        isHoje ? "text-orange-500" : "text-muted-foreground/60"
                      )}>
                        {d.getDate().toString().padStart(2, "0")}/{(d.getMonth() + 1).toString().padStart(2, "0")}
                      </span>
                    </div>

                    {/* Itens */}
                    <div className="flex-1 space-y-1">
                      {itens.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/40 italic leading-tight">—</p>
                      ) : itens.map((a) => (
                        <div key={a.id}
                          className={cn(
                            "group relative rounded-lg px-2 py-1 border transition-all",
                            editavel
                              ? "bg-white dark:bg-card border-border/60 hover:border-orange-300 cursor-pointer"
                              : "bg-white/80 dark:bg-card/80 border-border/40"
                          )}
                          onClick={editavel ? () => onEdit?.(a) : undefined}
                        >
                          <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400 leading-tight truncate">
                            {a.titulo}
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                            {a.conteudo}
                          </p>
                          {editavel && (
                            <button
                              className="absolute top-0.5 right-0.5 hidden group-hover:flex p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                              onClick={(e) => { e.stopPropagation(); onDelete?.(a.id); }}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Botão adicionar (apenas editavel) */}
                    {editavel && (
                      <button
                        className="mt-1.5 w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-orange-600 transition-colors rounded py-0.5 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                        onClick={() => onAdd?.(iso)}
                      >
                        <Plus className="h-3 w-3" /> Adicionar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Mobile: lista por dia ── */}
            <div className="sm:hidden space-y-2">
              {diasDatas.map(({ iso, d }, i) => {
                const itens = avisosNoDia(iso);
                const isHoje = iso === hojeIso;
                if (!editavel && itens.length === 0) return null; // mobile: oculta dias vazios em modo leitura
                return (
                  <div key={iso} className={cn(
                    "border rounded-xl p-3 transition-colors",
                    isHoje
                      ? "border-orange-400/70 bg-orange-50/50 dark:bg-orange-950/15"
                      : "border-border/50 bg-muted/10"
                  )}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={cn(
                        "text-xs font-bold",
                        isHoje ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
                      )}>
                        {DIAS_ABREV[i]} {d.getDate().toString().padStart(2, "0")}/{(d.getMonth() + 1).toString().padStart(2, "0")}
                      </p>
                      {editavel && (
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600 transition-colors"
                          onClick={() => onAdd?.(iso)}
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      )}
                    </div>
                    {itens.length === 0 ? (
                      <p className="text-xs text-muted-foreground/50 italic">Sem cardápio.</p>
                    ) : itens.map((a) => (
                      <div key={a.id}
                        className="flex gap-2 items-start rounded-lg bg-white dark:bg-card border border-border/50 px-2 py-1.5 mb-1 last:mb-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 leading-tight">
                            {a.titulo}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">{a.conteudo}</p>
                        </div>
                        {editavel && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => onEdit?.(a)}
                              className="text-muted-foreground hover:text-orange-600 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => onDelete?.(a.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Mobile vazio em modo leitura */}
              {!editavel && diasDatas.every(({ iso }) => avisosNoDia(iso).length === 0) && (
                <p className="text-xs text-muted-foreground/60 italic text-center py-2">
                  Sem cardápio nesta semana.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
