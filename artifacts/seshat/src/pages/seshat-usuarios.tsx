import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type OfertaDetail = {
  disciplinaId: string;
  disciplinaNome: string;
  cursoId: string;
  cursoNome: string;
  turnoId: string;
  turnoNome: string;
};

type UsuarioCard = {
  id: string;
  nome: string | null;
  email: string;
  fotoUrl: string | null;
  codigoAcesso: string;
  roles: { id: string; nome: string }[];
  ofertas: OfertaDetail[];
};

function getInitials(u: Pick<UsuarioCard, "nome" | "email">) {
  const src = u.nome?.trim() || u.email;
  const parts = src.split(/[\s@._\-]+/);
  return parts
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function UserPhotoCard({ u, small, cursoId, turnoId }: { u: UsuarioCard; small?: boolean; cursoId?: string; turnoId?: string }) {
  const displayName = u.nome || u.email;

  const disciplinas = cursoId && turnoId
    ? [...new Set(
        u.ofertas
          .filter((o) => o.cursoId === cursoId && o.turnoId === turnoId)
          .map((o) => o.disciplinaNome)
      )]
    : [];

  return (
    <div className={`flex flex-col items-center gap-1.5 ${small ? "w-24" : "w-28"}`}>
      <div
        className={`relative rounded-xl overflow-hidden bg-secondary/30 border border-border/60 shadow-sm ${
          small ? "w-24 h-32" : "w-28 h-36"
        }`}
      >
        {u.fotoUrl ? (
          <img
            src={u.fotoUrl}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar className={small ? "w-14 h-14" : "w-16 h-16"}>
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {getInitials(u)}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>
      <p
        className="text-xs font-medium text-center leading-tight line-clamp-2 w-full"
        title={displayName}
      >
        {displayName}
      </p>
      {disciplinas.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 w-full -mt-0.5" title={disciplinas.join(", ")}>
          {disciplinas.join(" · ")}
        </p>
      )}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-foreground/80 border-b border-border/40 pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SubSubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pl-4">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function UserGrid({ usuarios, small, cursoId, turnoId }: { usuarios: UsuarioCard[]; small?: boolean; cursoId?: string; turnoId?: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {usuarios.map((u) => (
        <UserPhotoCard key={u.id} u={u} small={small} cursoId={cursoId} turnoId={turnoId} />
      ))}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-3 border-b-2 border-primary/20 pb-2">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <span className="text-sm text-muted-foreground ml-auto">
        {count} usuário{count !== 1 && "s"}
      </span>
    </div>
  );
}

type SectionDef =
  | { type: "flat"; roleNome: string; usuarios: UsuarioCard[] }
  | { type: "by-curso"; roleNome: string; cursos: { cursoId: string; cursoNome: string; usuarios: UsuarioCard[] }[] }
  | { type: "professores"; turnos: { turnoId: string; turnoNome: string; cursos: { cursoId: string; cursoNome: string; usuarios: UsuarioCard[] }[] }[] };

function isProf(roleNome: string) {
  return /professor|docente/i.test(roleNome);
}
function isCoord(roleNome: string) {
  return /coord/i.test(roleNome);
}

function buildSections(usuarios: UsuarioCard[]): SectionDef[] {
  const flatMap = new Map<string, { roleId: string; roleNome: string; usuarios: UsuarioCard[] }>();
  const coordCursos = new Map<string, { cursoId: string; cursoNome: string; usuarios: UsuarioCard[] }>();
  const profTurnoCurso = new Map<string, Map<string, { cursoId: string; cursoNome: string; turnoId: string; turnoNome: string; usuarios: UsuarioCard[] }>>();

  for (const u of usuarios) {
    const roles = u.roles;
    if (roles.length === 0) {
      const key = "__sem_perfil__";
      if (!flatMap.has(key)) flatMap.set(key, { roleId: key, roleNome: "Sem perfil", usuarios: [] });
      if (!flatMap.get(key)!.usuarios.find((x) => x.id === u.id)) flatMap.get(key)!.usuarios.push(u);
      continue;
    }

    for (const role of roles) {
      if (isProf(role.nome)) {
        if (u.ofertas.length === 0) {
          const turnoKey = "__sem_turno__";
          if (!profTurnoCurso.has(turnoKey)) profTurnoCurso.set(turnoKey, new Map());
          const turnoMap = profTurnoCurso.get(turnoKey)!;
          const cursoKey = "__sem_curso__";
          if (!turnoMap.has(cursoKey)) turnoMap.set(cursoKey, { cursoId: cursoKey, cursoNome: "Sem curso", turnoId: turnoKey, turnoNome: "Sem turno", usuarios: [] });
          if (!turnoMap.get(cursoKey)!.usuarios.find((x) => x.id === u.id)) turnoMap.get(cursoKey)!.usuarios.push(u);
        } else {
          const seen = new Set<string>();
          for (const o of u.ofertas) {
            const comboKey = `${o.turnoId}::${o.cursoId}`;
            if (seen.has(comboKey)) continue;
            seen.add(comboKey);
            if (!profTurnoCurso.has(o.turnoId)) profTurnoCurso.set(o.turnoId, new Map());
            const turnoMap = profTurnoCurso.get(o.turnoId)!;
            if (!turnoMap.has(o.cursoId)) turnoMap.set(o.cursoId, { cursoId: o.cursoId, cursoNome: o.cursoNome, turnoId: o.turnoId, turnoNome: o.turnoNome, usuarios: [] });
            if (!turnoMap.get(o.cursoId)!.usuarios.find((x) => x.id === u.id)) turnoMap.get(o.cursoId)!.usuarios.push(u);
          }
        }
      } else if (isCoord(role.nome)) {
        if (u.ofertas.length === 0) {
          const cursoKey = "__sem_curso__";
          if (!coordCursos.has(cursoKey)) coordCursos.set(cursoKey, { cursoId: cursoKey, cursoNome: "Sem curso", usuarios: [] });
          if (!coordCursos.get(cursoKey)!.usuarios.find((x) => x.id === u.id)) coordCursos.get(cursoKey)!.usuarios.push(u);
        } else {
          const seen = new Set<string>();
          for (const o of u.ofertas) {
            if (seen.has(o.cursoId)) continue;
            seen.add(o.cursoId);
            if (!coordCursos.has(o.cursoId)) coordCursos.set(o.cursoId, { cursoId: o.cursoId, cursoNome: o.cursoNome, usuarios: [] });
            if (!coordCursos.get(o.cursoId)!.usuarios.find((x) => x.id === u.id)) coordCursos.get(o.cursoId)!.usuarios.push(u);
          }
        }
      } else {
        if (!flatMap.has(role.id)) flatMap.set(role.id, { roleId: role.id, roleNome: role.nome, usuarios: [] });
        if (!flatMap.get(role.id)!.usuarios.find((x) => x.id === u.id)) flatMap.get(role.id)!.usuarios.push(u);
      }
    }
  }

  const sections: SectionDef[] = [];

  if (coordCursos.size > 0) {
    const cursos = [...coordCursos.values()].sort((a, b) => a.cursoNome.localeCompare(b.cursoNome, "pt-BR"));
    sections.push({ type: "by-curso", roleNome: "Coordenação", cursos });
  }

  for (const group of flatMap.values()) {
    sections.push({ type: "flat", roleNome: group.roleNome, usuarios: group.usuarios });
  }

  if (profTurnoCurso.size > 0) {
    const turnos = [...profTurnoCurso.entries()]
      .map(([, cursoMap]) => {
        const firstCurso = [...cursoMap.values()][0];
        const cursos = [...cursoMap.values()].sort((a, b) => a.cursoNome.localeCompare(b.cursoNome, "pt-BR"));
        return { turnoId: firstCurso.turnoId, turnoNome: firstCurso.turnoNome, cursos };
      })
      .sort((a, b) => a.turnoNome.localeCompare(b.turnoNome, "pt-BR"));
    sections.push({ type: "professores", turnos });
  }

  sections.sort((a, b) => {
    const nameA = a.type === "professores" ? "Cursos" : a.roleNome;
    const nameB = b.type === "professores" ? "Cursos" : b.roleNome;
    return nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" });
  });

  return sections;
}

function countSection(s: SectionDef): number {
  if (s.type === "flat") return s.usuarios.length;
  if (s.type === "by-curso") return [...new Set(s.cursos.flatMap((c) => c.usuarios.map((u) => u.id)))].length;
  return [...new Set(s.turnos.flatMap((t) => t.cursos.flatMap((c) => c.usuarios.map((u) => u.id))))].length;
}

export default function CarometroUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/seshat-usuarios`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: UsuarioCard[]) => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setUsuarios([]))
      .finally(() => setIsLoading(false));
  }, []);

  const sections = buildSections(usuarios);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Carômetro de Usuários</h1>
        <p className="text-muted-foreground mt-2">Usuários agrupados por função, curso e turno.</p>
      </div>

      {isLoading ? (
        <div className="space-y-10">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-56" />
              <div className="flex flex-wrap gap-3">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="w-28 h-44 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center border rounded-xl bg-card border-dashed">
          <Users className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-lg font-semibold">Nenhum usuário encontrado</h3>
          <p className="text-muted-foreground max-w-sm mt-1">Não há usuários cadastrados no sistema.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {sections.map((section) => {
            if (section.type === "flat") {
              return (
                <section key={section.roleNome}>
                  <SectionHeader title={section.roleNome} count={countSection(section)} />
                  <div className="mt-4">
                    <UserGrid usuarios={section.usuarios} />
                  </div>
                </section>
              );
            }

            if (section.type === "by-curso") {
              return (
                <section key={section.roleNome}>
                  <SectionHeader title={section.roleNome} count={countSection(section)} />
                  <div className="mt-4 space-y-6">
                    {section.cursos.map((curso) => (
                      <SubSection key={curso.cursoId} title={curso.cursoNome}>
                        <UserGrid usuarios={curso.usuarios} />
                      </SubSection>
                    ))}
                  </div>
                </section>
              );
            }

            return (
              <section key="professores">
                <SectionHeader title="Cursos" count={countSection(section)} />
                <div className="mt-4 space-y-8">
                  {section.turnos.map((turno) => (
                    <SubSection key={turno.turnoId} title={turno.turnoNome}>
                      <div className="space-y-5 mt-2">
                        {turno.cursos.map((curso) => (
                          <SubSubSection key={curso.cursoId} title={curso.cursoNome}>
                            <UserGrid usuarios={curso.usuarios} small cursoId={curso.cursoId} turnoId={turno.turnoId} />
                          </SubSubSection>
                        ))}
                      </div>
                    </SubSection>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
