/**
 * PublicoAlvoSelector — seleção múltipla de perfis de público-alvo.
 * "Todos" é mutuamente exclusivo com os demais perfis.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PERFIS = [
  { value: "todos",          label: "Todos os perfis" },
  { value: "estudantes",     label: "Estudantes" },
  { value: "responsaveis",   label: "Pais / Responsáveis" },
  { value: "professores",    label: "Professores" },
  { value: "coordenadores",  label: "Coordenadores" },
  { value: "equipe_gestora", label: "Equipe Gestora" },
];

type Props = {
  value: string[];
  onChange: (v: string[]) => void;
  className?: string;
};

export function PublicoAlvoSelector({ value, onChange, className }: Props) {
  const toggle = (perfil: string) => {
    if (perfil === "todos") {
      onChange(["todos"]);
      return;
    }
    const semTodos = value.filter((v) => v !== "todos");
    if (semTodos.includes(perfil)) {
      const next = semTodos.filter((v) => v !== perfil);
      onChange(next.length > 0 ? next : ["todos"]);
    } else {
      onChange([...semTodos, perfil]);
    }
  };

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2", className)}>
      {PERFIS.map(({ value: v, label }) => {
        const checked = value.includes(v);
        const disabled = v !== "todos" && value.includes("todos") ? false : false;
        return (
          <label
            key={v}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors select-none",
              checked
                ? "border-primary/60 bg-primary/5 text-primary"
                : "border-border/50 hover:bg-muted/40 text-muted-foreground"
            )}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggle(v)}
              className="shrink-0"
            />
            <span className="text-sm leading-tight">{label}</span>
          </label>
        );
      })}
    </div>
  );
}
