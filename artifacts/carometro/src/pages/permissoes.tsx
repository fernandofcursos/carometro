import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, UserCog, Eye, Edit } from "lucide-react";

export default function PermissoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Acessos & Permissões</h1>
        <p className="text-muted-foreground mt-2">Gerenciamento de acessos e permissões do sistema.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Gerencie quem tem acesso ao sistema e seus perfis.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Perfis de acesso e grupos de permissões.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Permissões de Leitura</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Quem pode visualizar dados no sistema.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Edit className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Permissões de Escrita</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Quem pode criar, editar e excluir registros.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
