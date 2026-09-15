## Superpowers — Metodologia de Desenvolvimento

As skills do [Superpowers](https://github.com/obra/superpowers) estão instaladas em `.claude/skills/sp-*/`.

**Bootstrap**: Invoque `/sp-using-superpowers` no início de qualquer sessão de desenvolvimento para ativar o framework completo.

### Skills disponíveis

| Skill | Quando usar |
|---|---|
| `/sp-brainstorming` | Antes de implementar qualquer feature nova |
| `/sp-writing-plans` | Para criar plano de implementação em tarefas 2-5 min |
| `/sp-executing-plans` | Para executar o plano criado |
| `/sp-test-driven-development` | TDD RED-GREEN-REFACTOR em todo código novo |
| `/sp-systematic-debugging` | Quando há bug difícil de diagnosticar |
| `/sp-verification-before-completion` | Antes de marcar qualquer tarefa como concluída |
| `/sp-subagent-driven-development` | Para review em 2 estágios com subagentes |
| `/sp-dispatching-parallel-agents` | Para trabalho paralelo com múltiplos agentes |
| `/sp-using-git-worktrees` | Para branches isoladas por feature |
| `/sp-requesting-code-review` | Checklist antes de abrir PR |
| `/sp-receiving-code-review` | Como processar feedback de review |
| `/sp-finishing-a-development-branch` | Ao finalizar uma branch |
| `/sp-writing-skills` | Para criar novas skills no padrão Superpowers |

### Integração com o Seshat

O Seshat segue **Spec-Driven Development (SDD)**:
- Specs em `.specs/features/` definem o comportamento esperado
- Skills em `.claude/skills/seshat-*/` contêm o contexto técnico de cada módulo
- O Superpowers estrutura o **processo** de implementação dessas specs
