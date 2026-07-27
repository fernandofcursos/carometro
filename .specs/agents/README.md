# Agentes do Carômetro (SDD)

> Spec Driven Development — cada agente tem um papel claro, escopo definido e restrições explícitas.

---

## Visão Geral

O Carômetro usa um modelo de **agentes especializados** para organizar o desenvolvimento. Cada agente tem autoridade sobre um domínio específico e não pode agir fora dele sem aprovação.

```
         ┌──────────────────────────────────────────┐
         │              ATHENA                      │
         │  Arquiteta — aprova specs e ADRs         │
         └──────────────┬───────────────────────────┘
                        │ aprova
          ┌─────────────┼─────────────┐
          │             │             │
    ┌─────▼─────┐ ┌─────▼─────┐ ┌────▼──────┐
    │  HERMES   │ │  HEFESTO  │ │   ARES    │
    │ Implementa│ │  Schema   │ │ Segurança │
    └─────┬─────┘ └─────┬─────┘ └────┬──────┘
          │             │             │
    ┌─────▼─────────────▼─────────────▼──────┐
    │              THEMIS                     │
    │  Testes — valida a implementação        │
    └─────────────────┬───────────────────────┘
                      │ aprova qualidade
    ┌─────────────────▼───────────────────────┐
    │               ARGOS                     │
    │  Code Review — aprova o PR              │
    └─────────────────────────────────────────┘

    ┌─────────────────────────────────────────┐
    │               ORION                     │
    │  Diagnóstico — encontra e corrige bugs  │
    └─────────────────────────────────────────┘

    ┌─────────────────────────────────────────┐
    │               ATLAS                     │
    │  Infraestrutura — Docker e ambiente     │
    └─────────────────────────────────────────┘
```

---

## Tabela de Agentes

| Agente | Arquivo | Papel | Autoridade Principal |
|--------|---------|-------|----------------------|
| **Athena** | [athena.md](./athena.md) | Arquiteta | Aprovar specs, ADRs e constituição |
| **Hermes** | [hermes.md](./hermes.md) | Implementador | Escrever código backend + frontend |
| **Hefesto** | [hephaestus.md](./hephaestus.md) | Ferreiro do Schema | Schema Drizzle e banco de dados |
| **Themis** | [themis.md](./themis.md) | Guardiã dos Testes | Testes Vitest e TypeScript |
| **Argos** | [argos.md](./argos.md) | Revisor | Code review e aprovação de PR |
| **Orion** | [orion.md](./orion.md) | Caçador de Bugs | Diagnóstico e correção de falhas |
| **Atlas** | [atlas.md](./atlas.md) | Infraestrutura | Docker, Dev Container, ambiente |

---

## Fluxo Completo de Desenvolvimento

```
Feature Request
      ↓
[Athena] Revisar e aprovar spec (.specs/features/<recurso>.md)
      ↓
[Hefesto] Criar/atualizar schema Drizzle + push-force
      ↓
[Hermes] Implementar rota(s) + frontend
      ↓
[Themis] Escrever/validar testes — pnpm run test
      ↓
[Argos] Code review → aprovação do PR
      ↓
Merge no branch principal
```

**Em paralelo:**
- [Orion] Atua quando qualquer etapa falha com erros de runtime/ambiente
- [Atlas] Atua quando há mudança de infraestrutura ou problema de container

---

## Regras de Interação

1. **Athena aprova antes de implementar** — nenhuma feature sem spec aprovada
2. **Hefesto antes de Hermes** — schema aplicado antes de implementar a rota
3. **Themis antes de Argos** — testes passando antes do code review
4. **Orion não bloqueia** — trabalha em paralelo para desbloquear os outros
5. **Atlas é transversal** — atua em qualquer ponto quando há problema de ambiente

---

## Menção nos Arquivos de Spec

Cada spec de feature identifica os agentes responsáveis:

```markdown
**Agente responsável:** Hermes + Hefesto
**Athena:** aprovado
**Status:** Implementado ✅
```
