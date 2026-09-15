import Anthropic from "@anthropic-ai/sdk";
import { Response } from "express";
import {
  db,
  iaConversasTable,
  iaMensagensTable,
  eq,
  and,
  desc,
} from "@workspace/db";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_BASE = (escolaNome: string, cidade: string, uf: string) =>
  `Você é o Assistente Pedagógico do Seshat, sistema de gestão escolar do ${escolaNome}.
Contexto: ${cidade} — ${uf} — Secretaria de Educação do Distrito Federal (SEEDF).
Data atual: ${new Date().toLocaleDateString("pt-BR")}.

REGRAS:
- Responda APENAS com base nos documentos e dados fornecidos como contexto.
- Se não souber a resposta com certeza, diga claramente e oriente o usuário a consultar a secretaria.
- Nunca invente informações sobre notas, faltas, datas ou regulamentos.
- Respeite a privacidade: não mencione dados de outros estudantes.
- Linguagem: português brasileiro, formal mas acessível.
- Quando citar uma norma, informe a fonte (documento, artigo, página).`;

export async function streamChat(opts: {
  escolaId: string;
  usuarioId: string;
  conversaId?: string;
  mensagem: string;
  contexto?: string;
  res: Response;
}) {
  const {
    escolaId,
    usuarioId,
    conversaId,
    mensagem,
    contexto = "geral",
    res,
  } = opts;

  // Configurar SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (data: object) =>
    res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Criar ou buscar conversa
    let convId = conversaId;
    if (!convId) {
      const [nova] = await db
        .insert(iaConversasTable)
        .values({ escolaId, usuarioId, contexto })
        .returning({ id: iaConversasTable.id });
      convId = nova.id;
    }

    // Buscar histórico recente (6 mensagens, ordem cronológica)
    const historico = await db
      .select({
        papel: iaMensagensTable.papel,
        conteudo: iaMensagensTable.conteudo,
      })
      .from(iaMensagensTable)
      .where(eq(iaMensagensTable.conversaId, convId))
      .orderBy(desc(iaMensagensTable.criadoEm))
      .limit(6);

    historico.reverse();

    // Montar mensagens para Claude
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...historico.map(h => ({
        role: h.papel as "user" | "assistant",
        content: h.conteudo,
      })),
      { role: "user", content: mensagem },
    ];

    const inicio = Date.now();
    let textoCompleto = "";

    // Stream com Claude Opus 4.5 e thinking adaptativo
    // TODO: fetch escola.nome/cidade/uf from DB using escolaId and pass here
    const stream = client.messages.stream({
      model: "claude-opus-4-5",
      max_tokens: 64000,
      thinking: { type: "adaptive", display: "summarized" },
      system: SYSTEM_BASE("Seshat", "Brasília", "DF"),
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        textoCompleto += event.delta.text;
        sendEvent({ tipo: "chunk", conteudo: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    const tokensUsados =
      final.usage.input_tokens + final.usage.output_tokens;

    // Salvar mensagens na conversa
    await db.insert(iaMensagensTable).values([
      { escolaId, conversaId: convId, papel: "user", conteudo: mensagem },
      {
        escolaId,
        conversaId: convId,
        papel: "assistant",
        conteudo: textoCompleto,
        tokens: tokensUsados,
        modelo: "claude-opus-4-5",
        latenciaMs: Date.now() - inicio,
      },
    ]);

    sendEvent({ tipo: "fim", conversaId: convId, tokensUsados });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    sendEvent({ tipo: "erro", mensagem: message });
  } finally {
    res.end();
  }
}
