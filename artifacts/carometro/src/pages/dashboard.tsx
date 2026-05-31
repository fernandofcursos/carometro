import { useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, Building, Clock, Camera, BookOpen } from "lucide-react";
import { LgpdBanner } from "@/components/lgpd-banner";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-12 bg-muted rounded-md w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const coveragePercentage = stats?.totalEstudantes
    ? Math.round((stats.comFoto / stats.totalEstudantes) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <LgpdBanner />
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Painel</h1>
        <p className="text-muted-foreground mt-2">Visão geral do sistema de registros.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg text-primary"><Users className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Estudantes</p>
              <h2 className="text-3xl font-bold">{stats?.totalEstudantes ?? 0}</h2>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-violet-500/10 rounded-lg text-violet-600"><BookOpen className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Cursos</p>
              <h2 className="text-3xl font-bold">{stats?.totalCursos ?? 0}</h2>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-lg text-amber-600"><Building className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Turmas</p>
              <h2 className="text-3xl font-bold">{stats?.totalTurmas ?? 0}</h2>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg text-blue-600"><Clock className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Turnos</p>
              <h2 className="text-3xl font-bold">{stats?.totalTurnos ?? 0}</h2>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border/50">
          <CardContent className="p-6 flex flex-row items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg text-green-600"><Camera className="w-6 h-6" /></div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Com Foto</p>
              <h2 className="text-3xl font-bold">{stats?.comFoto ?? 0}</h2>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Camera className="w-5 h-5 text-muted-foreground" />
            Cobertura Fotográfica
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso geral</span>
              <span className="font-medium text-primary">{coveragePercentage}% concluído</span>
            </div>
            <Progress value={coveragePercentage} className="h-3 bg-muted" />
            <p className="text-sm text-muted-foreground">
              {stats?.semFoto
                ? `Faltam fotos de ${stats.semFoto} estudante${stats.semFoto !== 1 ? "s" : ""} no sistema.`
                : "Todos os estudantes possuem foto."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
