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
  return (
    parts
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function UserPhotoCard({
  u,
  small,
  cursoId,
  turnoId,
}: {
  u: UsuarioCard;
  small?: boolean;
  cursoId?: string;
  turnoId?: string;
}) {
  const displayName = u.nome || u.email;

  const disciplinas =
    cursoId && turnoId
      ? [
          ...new Set(
            u.ofertas
              .filter((o) => o.cursoId === cursoId && o.turnoId === turnoId)
              .map((o) => o.disciplinaNome)
          ),
        ]
      : [];

  return (
    <div className={`flex flex-col items-center gap-1 ${small ? "w-16" : "w-20"}`}>
      <div
        className={`relative rounded-lg overflow-hidden bg-secondary/30 border border-border/60 shadow-sm ${
          small ? "w-16 h-[85px]" : "w-20 h-[107px]"
        }`}
      >
        {u.fotoUrl ? (
          <img src={u.fotoUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Avatar className={small ? "w-9 h-9" : "w-11 h-11"}>
              <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                {getInitials(u)}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>
      <p className={`font-medium text-center leading-tight line-clamp-2 w-full ${small ? "text-[9px]" : "text-[10px]"}`} title={displayName}>
        {displayName}
      </p>
      {disciplinas.length > 0 && (
        <p
          className="text-[8px] text-muted-foreground text-center leading-tight line-clamp-2 w-full -mt-0.5"
          title={disciplinas.join(", ")}
        >
          {disciplinas.join(" · ")}
        </p>
      )}
    </div>
  );
}

function UserGrid({
  usuarios,
  small,
  cursoId,
  turnoId,
}: {
  usuarios: UsuarioCard[];
  small?: boolean;
  cursoId?: string;
  turnoId?: string;
}) {
  if (usuarios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic pl-1">Nenhum usuário cadastrado</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
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

// Group key used to build sections: turnoNome + cursoNome
type GroupKey = { turnoId: string; turnoNome: string; cursoId: string; cursoNome: string };
type GroupEntry = GroupKey & { usuarios: UsuarioCard[] };

function buildGroups(usuarios: UsuarioCard[]): GroupEntry[] {
  const map = new Map<string, GroupEntry>();

  for (const u of usuarios) {
    if (u.ofertas.length === 0) {
      const key = "__sem_turno__::__sem_curso__";
      if (!map.has(key)) {
        map.set(key, {
          turnoId: "__sem_turno__",
          turnoNome: "Sem turno",
          cursoId: "__sem_curso__",
          cursoNome: "Sem curso",
          usuarios: [],
        });
      }
      if (!map.get(key)!.usuarios.find((x) => x.id === u.id)) {
        map.get(key)!.usuarios.push(u);
      }
    } else {
      const seen = new Set<string>();
      for (const o of u.ofertas) {
        const key = `${o.turnoId}::${o.cursoId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!map.has(key)) {
          map.set(key, {
            turnoId: o.turnoId,
            turnoNome: o.turnoNome,
            cursoId: o.cursoId,
            cursoNome: o.cursoNome,
            usuarios: [],
          });
        }
        if (!map.get(key)!.usuarios.find((x) => x.id === u.id)) {
          map.get(key)!.usuarios.push(u);
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const t = a.turnoNome.localeCompare(b.turnoNome, "pt-BR");
    if (t !== 0) return t;
    return a.cursoNome.localeCompare(b.cursoNome, "pt-BR");
  });
}

// Group entries by turno, then list cursos inside each turno
type TurnoGroup = {
  turnoId: string;
  turnoNome: string;
  cursos: GroupEntry[];
};

function groupByTurno(groups: GroupEntry[]): TurnoGroup[] {
  const map = new Map<string, TurnoGroup>();
  for (const g of groups) {
    if (!map.has(g.turnoId)) {
      map.set(g.turnoId, { turnoId: g.turnoId, turnoNome: g.turnoNome, cursos: [] });
    }
    map.get(g.turnoId)!.cursos.push(g);
  }
  return [...map.values()].sort((a, b) => a.turnoNome.localeCompare(b.turnoNome, "pt-BR"));
}

// ----- Main reusable component -----

type CarometroGrupoPageProps = {
  endpoint: string;
  titulo: string;
  descricao: string;
};

function CarometroGrupoPage({ endpoint, titulo, descricao }: CarometroGrupoPageProps) {
  const [usuarios, setUsuarios] = useState<UsuarioCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`${BASE}${endpoint}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: UsuarioCard[]) => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setUsuarios([]))
      .finally(() => setIsLoading(false));
  }, [endpoint]);

  const groups = buildGroups(usuarios);
  const turnoGroups = groupByTurno(groups);
  const totalUsuarios = [...new Set(usuarios.map((u) => u.id))].length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">{titulo}</h1>
        <p className="text-muted-foreground mt-2">{descricao}</p>
      </div>

      {isLoading ? (
        <div className="space-y-10">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-8 w-56" />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="w-20 h-[130px] rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : usuarios.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center border rounded-xl bg-card border-dashed">
          <Users className="w-12 h-12 text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-lg font-semibold">Nenhum usuário encontrado</h3>
          <p className="text-muted-foreground max-w-sm mt-1">
            Não há usuários cadastrados neste grupo.
          </p>
        </div>
      ) : turnoGroups.length === 1 && turnoGroups[0].turnoId === "__sem_turno__" ? (
        // No turno/curso structure — render flat list
        <div className="space-y-4">
          <SectionHeader title={titulo} count={totalUsuarios} />
          <div className="mt-4">
            <UserGrid usuarios={usuarios} />
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {turnoGroups.map((turno) =>
            turno.cursos.length === 1 && turno.cursos[0].cursoId === "__sem_curso__" ? (
              // Turno without curso sub-groups
              <section key={turno.turnoId}>
                <SectionHeader title={turno.turnoNome} count={turno.cursos[0].usuarios.length} />
                <div className="mt-4">
                  <UserGrid
                    usuarios={turno.cursos[0].usuarios}
                    cursoId={turno.cursos[0].cursoId}
                    turnoId={turno.turnoId}
                  />
                </div>
              </section>
            ) : (
              <section key={turno.turnoId}>
                <SectionHeader
                  title={turno.turnoNome}
                  count={[...new Set(turno.cursos.flatMap((c) => c.usuarios.map((u) => u.id)))].length}
                />
                <div className="mt-4 space-y-6">
                  {turno.cursos.map((curso) => (
                    <SubSection key={curso.cursoId} title={curso.cursoNome}>
                      <UserGrid
                        usuarios={curso.usuarios}
                        small
                        cursoId={curso.cursoId}
                        turnoId={turno.turnoId}
                      />
                    </SubSection>
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ----- 6 named exports -----

export function CarometroEquipeGestora() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/equipe-gestora"
      titulo="Carômetro — Equipe Gestora"
      descricao="Membros da equipe gestora agrupados por turno e curso."
    />
  );
}

export function CarometroAdministracao() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/administracao"
      titulo="Carômetro — Administração"
      descricao="Membros da administração agrupados por turno e curso."
    />
  );
}

export function CarometroEquipePedagogica() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/equipe-pedagogica"
      titulo="Carômetro — Equipe Pedagógica"
      descricao="Membros da equipe pedagógica agrupados por turno e curso."
    />
  );
}

export function CarometroCorpoDocente() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/corpo-docente"
      titulo="Carômetro — Corpo Docente"
      descricao="Professores e docentes agrupados por turno e curso."
    />
  );
}

export function CarometroApoioOperacional() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/apoio-operacional"
      titulo="Carômetro — Apoio Operacional"
      descricao="Membros do apoio operacional agrupados por turno e curso."
    />
  );
}

export function CarometroUsuariosVinculados() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/usuarios-vinculados"
      titulo="Carômetro — Usuários Vinculados"
      descricao="Usuários vinculados agrupados por turno e curso."
    />
  );
}

export default CarometroGrupoPage;
