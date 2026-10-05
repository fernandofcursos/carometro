/**
 * Migração: re-assina carteiras HMAC existentes com Ed25519
 *
 * Pré-requisitos:
 *   1. Execute scripts/migrate-qrcode-ed25519.sql no banco
 *   2. Execute POST /api/admin/escolas/:id/gerar-chave para cada escola
 *   3. Execute este script: npx tsx scripts/migrate-tokens-ed25519.ts
 *
 * O script é idempotente: carteiras com token_hash já preenchido são puladas.
 */

import "dotenv/config";
import {
  db, carteirasTable, escolasTable, matriculasTable,
  usuariosTable, turmasTable, cursosTable,
  eq, and, isNull,
} from "@workspace/db";
import {
  assinarEd25519, hashToken, calcularExp,
  type TokenPayload,
} from "../artifacts/api-server/src/lib/token.js";

async function main() {
  const SESSION_SECRET = process.env.SESSION_SECRET;
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET não definido.");

  // Carteiras ativas sem token Ed25519 (token_hash nulo)
  const carteiras = await db
    .select({
      id:       carteirasTable.id,
      tipo:     carteirasTable.tipo,
      ano:      carteirasTable.ano,
      semestre: carteirasTable.semestre,
      usuarioId: carteirasTable.usuarioId,
      tokenHash: carteirasTable.tokenHash,
    })
    .from(carteirasTable)
    .where(and(
      eq(carteirasTable.status, "ativa"),
      isNull(carteirasTable.tokenHash),
    ));

  console.log(`Carteiras a migrar: ${carteiras.length}`);
  let ok = 0, puladas = 0, erros = 0;

  for (const c of carteiras) {
    if (c.tokenHash) { puladas++; continue; }

    try {
      // Busca dados da escola via matrícula → turma → curso → escola
      const [row] = await db
        .select({
          escolaId:     escolasTable.id,
          escolaNome:   escolasTable.nome,
          cursoNome:    cursosTable.nome,
          turmaSigla:   turmasTable.sigla,
          estudanteNome: usuariosTable.nome,
          privKey:      escolasTable.signingPrivateKey,
          pubKey:       escolasTable.signingPublicKey,
        })
        .from(matriculasTable)
        .innerJoin(turmasTable, eq(turmasTable.id, matriculasTable.turmaId))
        .innerJoin(cursosTable, eq(cursosTable.id, turmasTable.cursoId))
        .innerJoin(escolasTable, eq(escolasTable.id, cursosTable.escolaId))
        .innerJoin(usuariosTable, eq(usuariosTable.id, c.usuarioId))
        .where(and(
          eq(matriculasTable.usuarioId, c.usuarioId),
          eq(matriculasTable.ano, c.ano),
          eq(matriculasTable.semestre, c.semestre),
          isNull(matriculasTable.deletadoEm),
        ))
        .limit(1);

      if (!row?.privKey || !row?.pubKey) {
        console.warn(`  [pular] carteira ${c.id} — escola sem chave Ed25519`);
        puladas++;
        continue;
      }

      const semestre = (c.semestre === 1 || c.semestre === 2) ? c.semestre : 1;
      const payload: TokenPayload = {
        v: 1,
        tipo: c.tipo as TokenPayload["tipo"],
        escolaId:      row.escolaId,
        escolaNome:    row.escolaNome ?? "",
        usuarioId:     c.usuarioId,
        estudanteNome: row.estudanteNome ?? "Estudante",
        cursoNome:     row.cursoNome ?? "",
        turmaSigla:    row.turmaSigla ?? "",
        ano:           c.ano,
        semestre,
        ts:  Date.now(),
        exp: calcularExp(c.ano, semestre),
      };

      const token = await assinarEd25519(payload, row.privKey, SESSION_SECRET);
      const tHash = hashToken(token);

      await db.update(carteirasTable)
        .set({ token, tokenHash: tHash })
        .where(eq(carteirasTable.id, c.id));

      ok++;
      if (ok % 50 === 0) console.log(`  ${ok} migradas…`);
    } catch (err) {
      console.error(`  [erro] carteira ${c.id}:`, err);
      erros++;
    }
  }

  console.log(`\nConcluído. Migradas: ${ok} | Puladas: ${puladas} | Erros: ${erros}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
