# ADR-007: Orquestração de Containers — Kubernetes vs Alternativas

**Data:** 2026-07-27  
**Status:** Em avaliação — aguarda decisão do time  
**Autor:** Athena (arquiteta)

---

## Contexto

O Carômetro já usa Docker para desenvolvimento (docker-compose.yml) e tem infraestrutura básica de produção com nginx. Com a premissa de hospedagem em nuvem, é necessário definir como os containers serão orquestrados em produção.

---

## Opções Avaliadas

### Opção A — Docker Compose + VPS (atual)

**Como funciona:** `docker compose up` em um servidor único (VPS/EC2/Droplet).

| Critério | Avaliação |
|----------|-----------|
| Complexidade | ✅ Muito baixa — já conhecida pelo time |
| Custo | ✅ ~R$ 100–300/mês (VPS 2 vCPU, 4GB RAM) |
| Escalabilidade | ❌ Vertical apenas (upgrade da máquina) |
| Alta disponibilidade | ❌ Ponto único de falha |
| CI/CD | ✅ `docker compose pull && docker compose up -d` |
| Monitoramento | ⚠️ Manual (logs, cron healthcheck) |
| Indicado para | Escola pequena/média, < 1000 usuários simultâneos |

### Opção B — Plataforma PaaS (Railway / Render / Fly.io)

**Como funciona:** Deploy via `Dockerfile` em plataforma gerenciada. Sem configuração de servidor.

| Critério | Avaliação |
|----------|-----------|
| Complexidade | ✅ Mínima — push para git = deploy automático |
| Custo | ✅ ~R$ 50–200/mês para escala pequena |
| Escalabilidade | ✅ Horizontal automático (Fly.io, Railway Pro) |
| Alta disponibilidade | ✅ Multi-region em planos pagos |
| CI/CD | ✅ Integrado (GitHub Actions → deploy) |
| Monitoramento | ✅ Dashboard integrado, alertas, logs |
| Indicado para | Equipes pequenas, sem ops dedicado |

### Opção C — Kubernetes (GKE / EKS / AKS / k3s)

**Como funciona:** Cluster Kubernetes gerenciado com Deployments, Services, Ingress, HPA.

| Critério | Avaliação |
|----------|-----------|
| Complexidade | ❌ Alta — requer conhecimento de K8s, Helm, RBAC de infra |
| Custo | ❌ ~R$ 500–2000/mês (cluster managed) ou ops overhead (k3s) |
| Escalabilidade | ✅ Horizontal automático (HPA), zero-downtime deploys |
| Alta disponibilidade | ✅ Multi-node, auto-healing, rolling updates |
| CI/CD | ✅ GitHub Actions → kubectl apply / Helm upgrade |
| Monitoramento | ✅ Prometheus + Grafana (mas requer configuração) |
| Indicado para | Alto tráfego, equipe com ops dedicado, multi-tenant |

### Opção D — Cloud Run / App Service / Fargate (serverless containers)

**Como funciona:** Container escala para zero quando sem tráfego; instâncias criadas por demanda.

| Critério | Avaliação |
|----------|-----------|
| Complexidade | ✅ Baixa — deploy do container, sem cluster |
| Custo | ✅ Pay-per-use (zero quando sem tráfego) |
| Escalabilidade | ✅ Automático, ilimitado |
| Alta disponibilidade | ✅ Gerenciada pelo provedor |
| CI/CD | ✅ `gcloud run deploy` / `az containerapp update` |
| Monitoramento | ✅ Cloud-native (Cloud Monitoring, Azure Monitor) |
| Indicado para | Tráfego variável, sem tráfego 24/7 |

---

## Recomendação

**Para o estágio atual do Carômetro: Opção B (PaaS) → evoluir para Opção C quando necessário.**

### Justificativa

1. O sistema atende escolas — tráfego previsível, horário comercial, sem picos extremos
2. Equipe sem ops dedicado — overhead de K8s supera o benefício no curto prazo
3. PaaS (Fly.io ou Railway) oferece escalabilidade suficiente com custo e complexidade controlados
4. Kubernetes pode ser adotado no futuro se: múltiplas escolas (multi-tenant), equipe de ops formada, ou requisito de compliance exigir infra própria

### Caminho de Migração

```
Hoje: Docker Compose (dev)
  ↓
Próximo: PaaS com Dockerfile existente (Railway/Fly.io) — zero mudança no código
  ↓
Futuro: Kubernetes se necessário — adicionar /k8s com Helm chart
```

---

## Estrutura de Arquivos a Criar (quando decidido)

### Para PaaS (Fly.io)
```
fly.toml                    ← configuração do app
.github/workflows/deploy.yml ← CI/CD automático
```

### Para Kubernetes
```
k8s/
├── namespace.yaml
├── deployment-api.yaml
├── deployment-frontend.yaml
├── service-api.yaml
├── service-frontend.yaml
├── ingress.yaml
├── configmap.yaml
└── hpa.yaml
helm/
└── carometro/
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
```

---

## Consequências

**Se escolher PaaS agora:**
- Deploy em < 1 dia com `Dockerfile` existente
- Nenhuma mudança no código da aplicação
- Escalabilidade limitada a um único serviço por container

**Se escolher Kubernetes agora:**
- 2–4 semanas de configuração antes do primeiro deploy
- Requer decisão sobre provedor (GKE, EKS, AKS, k3s)
- Separar api-server e carometro em containers independentes (hoje compartilham serviço dev)

**Decisão adiada até:** definição do provedor cloud e tamanho estimado da base de usuários.

---

## Referências

- [Fly.io pricing](https://fly.io/docs/about/pricing/)
- [Railway pricing](https://railway.app/pricing)
- [GKE Autopilot](https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview)
- ADR-002: Neon PostgreSQL (banco já em nuvem)
