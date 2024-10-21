import { v } from "convex/values";
import { map } from "modern-async";
import OpenAI from "openai";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { action, mutation, query } from "../_generated/server";
import { paginate } from "../helpers";

// Action để nhúng tất cả tài liệu
export const embedAll = action({
  args: {},
  handler: async (ctx) => {
    await paginate(ctx, "documents", 20, async (documents) => {
      await ctx.runAction(api.ingest.embed.embedList, {
        documentIds: documents.map((doc) => doc._id),
      });
    });
  },
});

// Action để nhúng danh sách tài liệu
export const embedList = action({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, { documentIds }) => {
    const chunks = (
      await map(documentIds, (documentId) =>
        ctx.runQuery(api.ingest.embed.chunksNeedingEmbedding, {
          documentId,
        })
      )
    ).flat();

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.text));
    await map(embeddings, async (embedding, i) => {
      const { _id: chunkId } = chunks[i];
      await ctx.runMutation(api.ingest.embed.addEmbedding, {
        chunkId,
        embedding,
      });
    });
  },
});

// Query để lấy các chunk cần nhúng
export const chunksNeedingEmbedding = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("byDocumentId", (q) => q.eq("documentId", documentId))
      .collect();
    return chunks.filter((chunk) => chunk.embeddingId === null);
  },
});

// Mutation để thêm embedding
export const addEmbedding = mutation({
  args: { chunkId: v.id("chunks"), embedding: v.array(v.number()) },
  handler: async (ctx, { chunkId, embedding }) => {
    const embeddingId = await ctx.db.insert("embeddings", {
      embedding,
      chunkId,
    });
    await ctx.db.patch(chunkId, { embeddingId });
  },
});

// Hàm để nhúng văn bản
export async function embedTexts(texts: string[]) {
  if (texts.length === 0) return [];
  const openai = new OpenAI();
  const { data } = await openai.embeddings.create({
    input: texts,
    model: "text-embedding-ada-002",
  });
  return data.map(({ embedding }) => embedding);
}