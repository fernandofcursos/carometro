import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { AudioDescricao } from "@/components/audio-descricao";
import { ControleFonte } from "@/components/controle-fonte";
import { StatusRede } from "@/components/status-rede";
import { InstalarApp } from "@/components/instalar-app";
import { LgpdConsentModal } from "@/components/lgpd-consent-modal";

import Layout from "@/components/layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login/index";
import Dashboard from "@/pages/dashboard";
import Carometro from "@/pages/seshat";
import CarometroUsuarios from "@/pages/seshat-usuarios";
import {
  CarometroEquipeGestora,
  CarometroAdministracao,
  CarometroEquipePedagogica,
  CarometroCorpoDocente,
  CarometroApoioOperacional,
  CarometroUsuariosVinculados,
} from "@/pages/seshat-grupo";
import EstudantesList from "@/pages/estudantes/index";
import EstudantesNew from "@/pages/estudantes/new";
import EstudantesDetail from "@/pages/estudantes/detail";
import TurmasList from "@/pages/turmas/index";
import TurnosList from "@/pages/turnos/index";
import CursosList from "@/pages/cursos/index";
import ImportarPage from "@/pages/importar/index";
import OcorrenciasPage from "@/pages/ocorrencias/index";
import TiposOcorrenciasPage from "@/pages/tipos-ocorrencias/index";
import UsuariosPage from "@/pages/usuarios/index";
import RolesPage from "@/pages/roles/index";
import DisciplinasPage from "@/pages/disciplinas/index";
import EnturmacaoPage from "@/pages/enturmacao/index";
import TextosPadraoPage from "@/pages/textos-padrao/index";
import MailerDiagnosticoPage from "@/pages/mailer-diagnostico/index";
import LgpdPage from "@/pages/lgpd";
import PermissoesPage from "@/pages/permissoes";
import AuditoriaPage from "@/pages/auditoria";
import Iso27001Page from "@/pages/iso27001";
import PortalEstudantePage from "@/pages/portal/index";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user && location !== "/login") {
      setLocation("/login");
    }
  }, [loading, user, location, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || location === "/login") {
    return location === "/login" ? <LoginPage /> : null;
  }

  return (
    <>
      <ChangePasswordDialog />
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/carometro" component={Carometro} />
          <Route path="/seshat-usuarios" component={CarometroUsuarios} />
          <Route path="/carometro/equipe-gestora" component={CarometroEquipeGestora} />
          <Route path="/carometro/administracao" component={CarometroAdministracao} />
          <Route path="/carometro/equipe-pedagogica" component={CarometroEquipePedagogica} />
          <Route path="/carometro/corpo-docente" component={CarometroCorpoDocente} />
          <Route path="/carometro/apoio-operacional" component={CarometroApoioOperacional} />
          <Route path="/carometro/usuarios" component={CarometroUsuariosVinculados} />
          <Route path="/estudantes" component={EstudantesList} />
          <Route path="/estudantes/novo" component={EstudantesNew} />
          <Route path="/estudantes/:id" component={EstudantesDetail} />
          <Route path="/turmas" component={TurmasList} />
          <Route path="/turnos" component={TurnosList} />
          <Route path="/cursos" component={CursosList} />
          <Route path="/importar" component={ImportarPage} />
          <Route path="/ocorrencias" component={OcorrenciasPage} />
          <Route path="/tipos-ocorrencias" component={TiposOcorrenciasPage} />
          <Route path="/usuarios" component={UsuariosPage} />
          <Route path="/roles" component={RolesPage} />
          <Route path="/disciplinas" component={DisciplinasPage} />
          <Route path="/enturmacao" component={EnturmacaoPage} />
          <Route path="/portal" component={PortalEstudantePage} />
          <Route path="/textos-padrao-ocorrencias" component={TextosPadraoPage} />
          <Route path="/mailer-diagnostico" component={MailerDiagnosticoPage} />
          <Route path="/lgpd" component={LgpdPage} />
          <Route path="/permissoes" component={PermissoesPage} />
          <Route path="/auditoria" component={AuditoriaPage} />
          <Route path="/iso27001" component={Iso27001Page} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </WouterRouter>
        </SidebarProvider>
        <InstalarApp />
        <StatusRede />
        <ControleFonte />
        <AudioDescricao />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
