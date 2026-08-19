import { Link, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarTrigger,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Grid, Users, Building, Clock, BookOpen, Upload,
  AlertTriangle, Tag, UserCog, ShieldCheck, LogOut,
  ChevronDown, Check, GraduationCap, FileText,
  Wrench, Layers, School, Lock, Shield, ClipboardList, KeyRound,
  PanelLeft, Crown, Building2, Mail,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { Acessibilidade } from "@/components/acessibilidade";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { BottomNav } from "@/components/bottom-nav";
import { SecurityBar } from "@/components/security-bar";
import { StatusPill } from "@/components/status-pill";
import { LgpdConsentModal } from "@/components/lgpd-consent-modal";
import { useLGPD } from "@/hooks/use-lgpd";

type NavItem = { name: string; href: string; icon: React.ElementType };
type NavGroup = {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  items: NavItem[];
  subGroups?: { label: string; icon: React.ElementType; items: NavItem[] }[];
};

const nav = (name: string, href: string, Icon: React.ElementType): NavItem => ({ name, href, icon: Icon });

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, switchRole } = useAuth();
  const perms = new Set(user?.permissions ?? []);
  const hasAny = (...ps: string[]) => ps.some((p) => perms.has(p));
  const isMobile = useIsMobile();

  const canManageGeral = hasAny("turmas:manage", "cursos:manage", "turnos:manage");
  const canImport = hasAny("import:execute");
  const canManageUsuarios = hasAny("usuarios:manage");
  const canManageRoles = hasAny("roles:manage");
  const canManageDisciplinas = hasAny("disciplinas:manage");
  const canViewCarometro = hasAny("carometro:view");
  const canViewEstudantes = hasAny("estudantes:view", "estudantes:manage");
  const canManageEstudantes = hasAny("estudantes:manage");
  const canViewOcorrencias = hasAny("ocorrencias:view", "ocorrencias:create");
  const canManageTiposOcorrencias = hasAny("tipos-ocorrencias:manage");

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const groups: NavGroup[] = [
    ...(canViewCarometro ? [{
      label: "Carômetro",   // nome da funcionalidade (mantido)
      icon: Grid,
      color: "#6366f1",
      bgColor: "#eef2ff",
      items: [
        nav("Estudantes", "/carometro", Users),
        nav("Equipe Gestora", "/carometro/equipe-gestora", Crown),
        nav("Administração", "/carometro/administracao", Building2),
        nav("Equipe Pedagógica", "/carometro/equipe-pedagogica", GraduationCap),
        nav("Corpo Docente", "/carometro/corpo-docente", BookOpen),
        nav("Apoio / Operacional", "/carometro/apoio-operacional", Wrench),
      ],
    }] : []),
    ...((canManageUsuarios || canManageRoles) ? [{
      label: "Administração",
      icon: ShieldCheck,
      color: "#8b5cf6",
      bgColor: "#f5f3ff",
      items: [
        ...(canManageRoles ? [nav("Roles & Permissões", "/roles", ShieldCheck)] : []),
        ...(canManageUsuarios ? [nav("Usuários", "/usuarios", UserCog)] : []),
        ...(canManageUsuarios ? [nav("Diagnóstico de E-mail", "/mailer-diagnostico", Mail)] : []),
      ],
    }] : []),
    ...(canManageGeral ? [{
      label: "Modulação",
      icon: Layers,
      color: "#0ea5e9",
      bgColor: "#f0f9ff",
      items: [
        nav("Cursos", "/cursos", BookOpen),
        nav("Turnos", "/turnos", Clock),
        nav("Turmas", "/turmas", Building),
        ...(canManageDisciplinas ? [nav("Disciplinas", "/disciplinas", GraduationCap)] : []),
      ],
    }] : []),
    ...(canManageEstudantes ? [{
      label: "Enturmação",
      icon: School,
      color: "#10b981",
      bgColor: "#ecfdf5",
      items: [
        nav("Estudantes", "/enturmacao", Users),
      ],
    }] : []),
    ...((canViewOcorrencias || canManageTiposOcorrencias) ? [{
      label: "Ocorrências",
      icon: AlertTriangle,
      color: "#f59e0b",
      bgColor: "#fffbeb",
      items: [
        ...(canManageTiposOcorrencias ? [nav("Tipos de Ocorrência", "/tipos-ocorrencias", Tag)] : []),
        ...(canManageTiposOcorrencias ? [nav("Textos Padrão", "/textos-padrao-ocorrencias", FileText)] : []),
        ...(canViewOcorrencias ? [nav("Relatório de Ocorrências", "/ocorrencias", ClipboardList)] : []),
      ],
    }] : []),
    ...(canImport ? [{
      label: "Manutenção",
      icon: Wrench,
      color: "#64748b",
      bgColor: "#f8fafc",
      items: [],
      subGroups: [{
        label: "Importação",
        icon: Upload,
        items: [
          nav("Cursos", "/importar", BookOpen),
          nav("Turmas", "/importar", Building),
          nav("Disciplinas", "/importar", GraduationCap),
          nav("Estudantes", "/importar", Users),
          nav("Professores", "/importar", UserCog),
        ],
      }],
    }] : []),
    {
      label: "Privacidade & Segurança",
      icon: Shield,
      color: "#ef4444",
      bgColor: "#fef2f2",
      items: [
        nav("LGPD · Consentimentos", "/lgpd", Lock),
        nav("Acessos & Permissões", "/permissoes", ShieldCheck),
        nav("Log de Auditoria", "/auditoria", ClipboardList),
        nav("ISO 27001 · Controles", "/iso27001", KeyRound),
      ],
    },
  ];

  const NavItemEl = ({ item, groupColor }: { item: NavItem; groupColor: string }) => {
    const active = isActive(item.href);
    return (
      <SidebarMenuItem className="mb-0.5">
        <SidebarMenuButton asChild isActive={active}
          className={`transition-all duration-200 hover:bg-muted/80 ${active ? "font-medium" : "text-muted-foreground"}`}
          style={active ? { color: groupColor, backgroundColor: groupColor + "0D" } : undefined}
        >
          <Link href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-md">
            <item.icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const groupHasActive = (group: NavGroup) =>
    group.items.some((i) => isActive(i.href)) ||
    (group.subGroups?.some((sg) => sg.items.some((i) => isActive(i.href))) ?? false);

  const activeGroupLabel = useMemo(
    () => groups.find(groupHasActive)?.label ?? "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location, user?.activeRoleId],
  );

  const [openGroup, setOpenGroup] = useState<string>(activeGroupLabel);
  useEffect(() => {
    setOpenGroup(activeGroupLabel);
  }, [activeGroupLabel]);

  const activeRole = user?.allRoles?.find((r) => r.id === user.activeRoleId);
  const hasMultipleRoles = (user?.allRoles?.length ?? 0) > 1;
  const displayName = user?.nome || user?.email || "";
  const avatarFallback = displayName.substring(0, 2).toUpperCase();

  return (
    <Sidebar className="border-r border-border/50">
      <SidebarHeader className="h-16 flex items-center px-6 pt-4 border-b border-border/50">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 font-semibold text-lg text-primary tracking-tight">
            {/* Heliê de Seshat: estrela de 7 pontas + bastão + chifres */}
            <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon
                points="32,10 34.25,18.09 42.16,14.89 37.26,21.80 44.67,25.89 36.22,26.37 37.41,34.82 32,28.40 26.59,34.82 27.78,26.37 19.33,25.89 26.74,21.80 21.84,14.89 29.75,18.09"
                className="fill-primary"/>
              <line x1="32" y1="36" x2="32" y2="57" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M 30.5,36 Q 21,42 16,53" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M 33.5,36 Q 43,42 48,53" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <span className="group-data-[collapsible=icon]:hidden tracking-wide">Seshat</span>
          </div>
          <SidebarToggle />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4 flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <Accordion
            type="single"
            collapsible
            value={openGroup}
            onValueChange={setOpenGroup}
            className="w-full space-y-0.5"
          >
            {groups.map((group, index) => {
              const active = groupHasActive(group);
              return (
                <motion.div
                  key={group.label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
                >
                <AccordionItem value={group.label} className="border-none">
                  <AccordionTrigger
                    className={`px-3 py-2 rounded-md hover:no-underline hover:bg-muted/60 transition-colors text-sm font-medium ${active ? "" : "text-foreground/80"}`}
                    style={active ? { color: group.color } : undefined}
                  >
                    <span className="flex items-center gap-2.5">
                      <div
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ backgroundColor: active ? group.bgColor : group.bgColor, color: group.color }}
                      >
                        <group.icon className="w-4 h-4 shrink-0" />
                      </div>
                      <span className="group-data-[collapsible=icon]:hidden">{group.label}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-1 pt-0.5">
                    {group.items.length > 0 && (
                      <SidebarMenu className="pl-2">
                        {group.items.map((item) => <NavItemEl key={item.href + item.name} item={item} groupColor={group.color} />)}
                      </SidebarMenu>
                    )}
                    {group.subGroups?.map((sub) => (
                      <SidebarMenu key={sub.label} className="mt-1 pl-2">
                        <SidebarMenuItem>
                          <SidebarMenuButton className="text-muted-foreground/80 font-medium cursor-default hover:bg-transparent px-3">
                            <sub.icon className="w-4 h-4 shrink-0" />
                            <span className="group-data-[collapsible=icon]:hidden">{sub.label}</span>
                          </SidebarMenuButton>
                          <SidebarMenuSub>
                            {sub.items.map((item) => (
                              <SidebarMenuSubItem key={item.href + item.name}>
                                <SidebarMenuSubButton asChild isActive={isActive(item.href)}>
                                  <Link href={item.href} className="flex items-center gap-2">
                                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="group-data-[collapsible=icon]:hidden">{item.name}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    ))}
                  </AccordionContent>
                </AccordionItem>
                </motion.div>
              );
            })}
          </Accordion>
        </div>

        <SecurityBar />

        {user && (
          <div className="border-t pt-3 mt-auto space-y-1 group-data-[collapsible=icon]:hidden">
            {hasMultipleRoles && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Perfil ativo</p>
                      <p className="text-xs font-medium truncate capitalize">{activeRole?.nome ?? "—"}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-48">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Alternar perfil</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.allRoles.map((role) => (
                    <DropdownMenuItem
                      key={role.id}
                      onClick={() => switchRole(role.id)}
                      className="flex items-center justify-between capitalize cursor-pointer"
                    >
                      <span>{role.nome}</span>
                      {role.id === user.activeRoleId && (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                {user.nome && <p className="text-xs font-medium truncate">{user.nome}</p>}
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                {!hasMultipleRoles && activeRole && (
                  <p className="text-xs text-muted-foreground/70 capitalize">{activeRole.nome}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={logout} title="Sair">
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

function SidebarToggle() {
  const { toggleSidebar, state } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="hidden md:flex h-7 w-7"
      onClick={toggleSidebar}
      title={state === "collapsed" ? "Expandir" : "Colapsar"}
    >
      <PanelLeft className={cn("h-4 w-4 transition-transform", state === "collapsed" && "rotate-180")} />
    </Button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { hasPendingConsents } = useLGPD(user?.id ?? null);
  const [lgpdModalOpen, setLgpdModalOpen] = useState(false);
  const { state, toggleSidebar } = useSidebar(); // Correção toggle: detectar estado collapsed no header

  return (
    <div className="min-h-screen flex w-full bg-background/50">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-3 px-4 md:px-8 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          {/* Mobile: sempre visível para abrir o drawer */}
          <SidebarTrigger className="md:hidden" />
          {/* Desktop: só aparece quando o sidebar está collapsed (offcanvas) para trazer de volta */}
          {state === "collapsed" && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex h-7 w-7"
              onClick={toggleSidebar}
              title="Expandir menu"
            >
              <PanelLeft className="h-4 w-4 rotate-180" />
            </Button>
          )}
          <div className="flex-1" />
          {hasPendingConsents && (
            <button
              onClick={() => setLgpdModalOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-600 hover:bg-amber-500/20 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              <span>LGPD pendente</span>
            </button>
          )}
          <StatusPill />
          <div className="hidden md:block">
            <Acessibilidade />
          </div>
        </header>
        <main className={cn(
          "flex-1 w-full animate-in fade-in duration-300",
          isMobile ? "p-4 pb-24 max-w-none" : "p-4 md:p-8 max-w-7xl mx-auto"
        )}>
          {children}
        </main>
      </div>
      <BottomNav />
      <LgpdConsentModal userId={user?.id ?? null} open={lgpdModalOpen} onOpenChange={setLgpdModalOpen} />
    </div>
  );
}
