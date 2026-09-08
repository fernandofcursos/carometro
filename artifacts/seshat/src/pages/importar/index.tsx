import { useState, useRef } from "react";
import { useImportCursos, useImportTurmas, useImportEstudantes } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

type ImportResult = { imported: number; errors: string[] } | null;

function downloadTemplate(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function ImportCard({
  title, description, templateName, templateContent, headers, onImport, isPending, result, note,
}: {
  title: string; description: string; templateName: string; templateContent: string;
  headers: string[]; onImport: (rows: Record<string, string>[]) => void; isPending: boolean;
  result: ImportResult; note?: string;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) { toast({ title: "Arquivo vazio ou formato inválido", variant: "destructive" }); return; }
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="mt-1 text-xs">{description}</CardDescription>
            {note && <p className="mt-1 text-xs text-muted-foreground/70 italic">{note}</p>}
          </div>
          <Button variant="outline" size="sm" className="shrink-0 text-xs h-7 px-2 gap-1"
            onClick={() => downloadTemplate(templateName, templateContent)}>
            <Download className="w-3 h-3" />Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-muted-foreground">
            {rows.length > 0 ? `${rows.length} linha${rows.length !== 1 ? "s" : ""} carregada${rows.length !== 1 ? "s" : ""}` : "Clique para escolher um arquivo CSV"}
          </p>
        </div>

        {rows.length > 0 && (
          <div className="overflow-auto rounded-lg border bg-muted/20 max-h-48">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground border-b">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    {headers.map((h) => <td key={h} className="px-3 py-1.5 text-foreground truncate max-w-[140px]">{row[h] ?? ""}</td>)}
                  </tr>
                ))}
                {rows.length > 5 && (
                  <tr><td colSpan={headers.length} className="px-3 py-1.5 text-muted-foreground text-center italic">...mais {rows.length - 5} linha{rows.length - 5 !== 1 ? "s" : ""}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {result && (
          <div className={`rounded-lg p-4 text-sm space-y-2 ${result.errors.length === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
            <div className="flex items-center gap-2 font-semibold">
              {result.errors.length === 0 ? (
                <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="text-green-700">{result.imported} registro{result.imported !== 1 ? "s" : ""} importado{result.imported !== 1 ? "s" : ""} com sucesso!</span></>
              ) : (
                <><AlertCircle className="w-4 h-4 text-amber-600" /><span className="text-amber-700">{result.imported} importado{result.imported !== 1 ? "s" : ""}, {result.errors.length} erro{result.errors.length !== 1 ? "s" : ""}</span></>
              )}
            </div>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-700 pl-6 list-disc">
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        )}

        <Button className="w-full" disabled={rows.length === 0 || isPending} onClick={() => onImport(rows)}>
          <Upload className="w-4 h-4 mr-2" />
          {isPending ? "Importando..." : `Importar ${rows.length > 0 ? rows.length + " registro" + (rows.length !== 1 ? "s" : "") : ""}`}
        </Button>
      </CardContent>
    </Card>
  );
}

function useImportDisciplinas() {
  return useMutation({
    mutationKey: ["importDisciplinas"],
    mutationFn: (body: { rows: { data: Record<string, unknown> }[] }) =>
      customFetch<{ imported: number; errors: string[] }>("/api/import/disciplinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  });
}

function useImportProfessores() {
  return useMutation({
    mutationKey: ["importProfessores"],
    mutationFn: (body: { rows: { data: Record<string, unknown> }[] }) =>
      customFetch<{ imported: number; errors: string[] }>("/api/import/professores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  });
}

export default function ImportarPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const importCursos = useImportCursos();
  const importTurmas = useImportTurmas();
  const importEstudantes = useImportEstudantes();
  const importDisciplinas = useImportDisciplinas();
  const importProfessores = useImportProfessores();

  const [cursosResult, setCursosResult] = useState<ImportResult>(null);
  const [turmasResult, setTurmasResult] = useState<ImportResult>(null);
  const [estudantesResult, setEstudantesResult] = useState<ImportResult>(null);
  const [disciplinasResult, setDisciplinasResult] = useState<ImportResult>(null);
  const [professoresResult, setProfessoresResult] = useState<ImportResult>(null);

  const handleImportCursos = (rows: Record<string, string>[]) => {
    importCursos.mutate(
      { data: { rows: rows.map((r) => ({ data: { nome: r.nome ?? "", descricao: r.descricao ?? "", turnoNome: r.turnoNome ?? "", ativo: r.ativo ?? "true" } })) } },
      {
        onSuccess: (res) => {
          setCursosResult(res);
          queryClient.invalidateQueries();
          toast({ title: res.imported > 0 ? `${res.imported} curso(s) importado(s)` : "Nenhum curso importado" });
        },
        onError: () => toast({ title: "Erro na importação de cursos", variant: "destructive" }),
      }
    );
  };

  const handleImportTurmas = (rows: Record<string, string>[]) => {
    importTurmas.mutate(
      { data: { rows: rows.map((r) => ({ data: { sigla: r.sigla ?? "", descricao: r.descricao ?? "", cursoNome: r.cursoNome ?? "", turnoNome: r.turnoNome ?? "", ano: r.ano ?? "", semestre: r.semestre ?? "" } })) } },
      {
        onSuccess: (res) => {
          setTurmasResult(res);
          queryClient.invalidateQueries();
          toast({ title: res.imported > 0 ? `${res.imported} turma(s) importada(s)` : "Nenhuma turma importada" });
        },
        onError: () => toast({ title: "Erro na importação de turmas", variant: "destructive" }),
      }
    );
  };

  const handleImportEstudantes = (rows: Record<string, string>[]) => {
    importEstudantes.mutate(
      { data: { rows: rows.map((r) => ({ data: {
        nome: r.nome ?? "",
        registro: r.registro ?? "",
        emailProprio: r.emailProprio || r.email || undefined,
        emailResponsavel: r.emailResponsavel || undefined,
        turmaSigla: r.turmaSigla ?? "",
      } })) } },
      {
        onSuccess: (res) => {
          setEstudantesResult(res);
          queryClient.invalidateQueries();
          toast({ title: res.imported > 0 ? `${res.imported} estudante(s) importado(s)` : "Nenhum estudante importado" });
        },
        onError: () => toast({ title: "Erro na importação de estudantes", variant: "destructive" }),
      }
    );
  };

  const handleImportDisciplinas = (rows: Record<string, string>[]) => {
    importDisciplinas.mutate(
      { rows: rows.map((r) => ({ data: { nome: r.nome ?? "", cursoNome: r.cursoNome ?? "", turnoNome: r.turnoNome ?? "", ativo: r.ativo ?? "true" } })) },
      {
        onSuccess: (res) => {
          setDisciplinasResult(res);
          queryClient.invalidateQueries();
          toast({ title: res.imported > 0 ? `${res.imported} disciplina(s) importada(s)` : "Nenhuma disciplina importada" });
        },
        onError: () => toast({ title: "Erro na importação de disciplinas", variant: "destructive" }),
      }
    );
  };

  const handleImportProfessores = (rows: Record<string, string>[]) => {
    importProfessores.mutate(
      { rows: rows.map((r) => ({ data: { nome: r.nome ?? "", email: r.email ?? "", disciplinaNome: r.disciplinaNome ?? "", cursoNome: r.cursoNome ?? "", turnoNome: r.turnoNome ?? "" } })) },
      {
        onSuccess: (res) => {
          setProfessoresResult(res);
          queryClient.invalidateQueries();
          toast({ title: res.imported > 0 ? `${res.imported} professor(es) importado(s)` : "Nenhum professor importado" });
        },
        onError: () => toast({ title: "Erro na importação de professores", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Importar Dados</h1>
        <p className="text-muted-foreground mt-2">
          Importe dados via arquivo CSV. Siga a ordem: <strong>Cursos</strong> → <strong>Disciplinas</strong> → <strong>Professores</strong> → <strong>Turmas</strong> → <strong>Estudantes</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ImportCard
          title="1. Importar Cursos"
          description="Crie os cursos primeiro. Coluna obrigatória: nome."
          note="turnoNome é informativo — use para referência ao importar disciplinas"
          templateName="template_cursos.csv"
          templateContent="sigla,nome,descricao,turnoNome,ativo\nINFO,Técnico em Informática,Curso técnico de TI,Manhã,true\nADM,Técnico em Administração,Curso técnico de Administração,Tarde,true"
          headers={["nome", "descricao", "turnoNome", "ativo"]}
          onImport={handleImportCursos}
          isPending={importCursos.isPending}
          result={cursosResult}
        />
        <ImportCard
          title="2. Importar Disciplinas"
          description="Requer cursos e turnos já cadastrados."
          templateName="template_disciplinas.csv"
          templateContent="nome,cursoNome,turnoNome,ativo\nProgramação Web,Técnico em Informática,Manhã,true"
          headers={["nome", "cursoNome", "turnoNome", "ativo"]}
          onImport={handleImportDisciplinas}
          isPending={importDisciplinas.isPending}
          result={disciplinasResult}
        />
        <ImportCard
          title="3. Importar Professores"
          description="Requer disciplinas, cursos e turnos já cadastrados."
          templateName="template_professores.csv"
          templateContent="nome,email,disciplinaNome,cursoNome,turnoNome\nAna Silva,ana@escola.edu.br,Programação Web,Técnico em Informática,Manhã"
          headers={["nome", "email", "disciplinaNome", "cursoNome", "turnoNome"]}
          onImport={handleImportProfessores}
          isPending={importProfessores.isPending}
          result={professoresResult}
        />
        <ImportCard
          title="4. Importar Turmas"
          description="Requer cursos e turnos já cadastrados."
          templateName="template_turmas.csv"
          templateContent="sigla,descricao,cursoNome,turnoNomes,ano,semestre\nINF1A,Informática 1º Ano A,Técnico em Informática,Manhã,2025,1\nINF1B,Informática 1º Ano B,Técnico em Informática,Manhã|Tarde,2025,1"
          headers={["sigla", "descricao", "cursoNome", "turnoNomes", "ano", "semestre"]}
          note="turnoNomes aceita múltiplos turnos separados por | (ex: Manhã|Tarde)"
          onImport={handleImportTurmas}
          isPending={importTurmas.isPending}
          result={turmasResult}
        />
        <ImportCard
          title="5. Importar Estudantes"
          description="Requer turmas já cadastradas."
          templateName="template_estudantes.csv"
          templateContent="nome,registro,emailProprio,emailResponsavel,turmaSigla\nJoão Silva,2024001,joao@escola.edu.br,responsavel@email.com,INF1A"
          headers={["nome", "registro", "emailProprio", "emailResponsavel", "turmaSigla"]}
          onImport={handleImportEstudantes}
          isPending={importEstudantes.isPending}
          result={estudantesResult}
        />
      </div>
    </div>
  );
}
