import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Item = { texto: string; tipo: string; ir: () => void };

function coletar(): { titulos: Item[]; marcos: Item[]; links: Item[] } {
  const titulos: Item[] = [];
  document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const texto = el.innerText.trim();
    if (!texto) return;
    titulos.push({
      texto,
      tipo: el.tagName,
      ir: () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
    });
  });
  const marcos: Item[] = [];
  document
    .querySelectorAll<HTMLElement>(
      "header, main, nav, footer, aside, section, [role='banner'], [role='main'], [role='navigation'], [role='contentinfo'], [role='complementary']",
    )
    .forEach((el) => {
      const role = el.getAttribute("role") || el.tagName.toLowerCase();
      const rotulo = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.id || role;
      marcos.push({
        texto: rotulo,
        tipo: role,
        ir: () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
      });
    });
  const links: Item[] = [];
  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((el) => {
    const texto = el.innerText.trim() || el.getAttribute("aria-label") || el.href;
    links.push({
      texto,
      tipo: "link",
      ir: () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
    });
  });
  return { titulos, marcos, links };
}

export function EstruturaPaginaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [dados, setDados] = useState<ReturnType<typeof coletar> | null>(null);

  useEffect(() => {
    if (open) setDados(coletar());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Estrutura da página</DialogTitle>
          <DialogDescription>
            Marcos, cabeçalhos e links presentes nesta página.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4">
          {dados && (
            <>
              <Bloco titulo="Marcos" itens={dados.marcos} onIr={() => onOpenChange(false)} />
              <Bloco titulo="Cabeçalhos" itens={dados.titulos} onIr={() => onOpenChange(false)} />
              <Bloco titulo="Links" itens={dados.links} onIr={() => onOpenChange(false)} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ titulo, itens, onIr }: { titulo: string; itens: Item[]; onIr: () => void }) {
  return (
    <section>
      <h3 className="font-semibold text-sm mb-1.5">
        {titulo} <span className="text-muted-foreground">({itens.length})</span>
      </h3>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum item encontrado.</p>
      ) : (
        <ul className="space-y-1">
          {itens.slice(0, 50).map((it, i) => (
            <li key={i}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start h-auto py-1.5 text-left whitespace-normal"
                onClick={() => {
                  it.ir();
                  onIr();
                }}
              >
                <span className="text-[0.65rem] font-mono uppercase mr-2 text-muted-foreground shrink-0">
                  {it.tipo}
                </span>
                <span className="truncate">{it.texto}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
