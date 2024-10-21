import { CheerioAPI, load } from "cheerio";
import { v } from "convex/values";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { map } from "modern-async";
import { api } from "../_generated/api";
import { mutation, action } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

// Action để quét trang web
export const scrapeSite = action({
  args: {
    sitemapUrl: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { sitemapUrl, limit }) => {
    const response = await fetch(sitemapUrl);
    const xml = await response.text();
    const $ = load(xml, { xmlMode: true });
    const urls = $("url > loc")
      .map((_i, elem) => $(elem).text())
      .get()
      .slice(0, limit);
    await map(urls, (url) =>
      ctx.scheduler.runAfter(0, api.ingest.load.fetchSingle, { url })
    );
  },
});

// Action để lấy dữ liệu từ một URL
export const fetchSingle = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, { url }) => {
    const response = await fetch(url);
    const text = parsePage(await response.text());
    if (text.length > 0) {
      await ctx.runMutation(api.ingest.load.updateDocument, { url, text });
    }
  },
});

// Mutation để cập nhật tài liệu
export const updateDocument = mutation({
  args: { url: v.string(), text: v.string() },
  handler: async (ctx, { url, text }) => {
    const latestVersion = await ctx.db
      .query("documents")
      .withIndex("byUrl", (q) => q.eq("url", url))
      .order("desc")
      .first();

    const hasChanged = latestVersion === null || latestVersion.text !== text;
    if (hasChanged) {
      const documentId = await ctx.db.insert("documents", { url, text });
      const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
        chunkSize: 2000,
        chunkOverlap: 100,
      });
      const chunks = await splitter.splitText(text);
      await map(chunks, async (chunk) => {
        await ctx.db.insert("chunks", {
          documentId,
          text: chunk,
          embeddingId: null,
        });
      });
    }
  },
});

// Mutation để xóa tài liệu và chunk cũ
export const eraseStaleDocumentsAndChunks = mutation({
  args: {
    forReal: v.boolean(),
  },
  handler: async (ctx, args) => {
    const allDocuments = await ctx.db
      .query("documents")
      .order("desc")
      .collect();
    const byUrl: Record<string, Doc<"documents">[]> = {};
    allDocuments.forEach((doc) => {
      byUrl[doc.url] ??= [];
      byUrl[doc.url].push(doc);
    });
    await map(Object.values(byUrl), async (docs) => {
      if (docs.length > 1) {
        await map(docs.slice(1), async (doc) => {
          const chunks = await ctx.db
            .query("chunks")
            .withIndex("byDocumentId", (q) => q.eq("documentId", doc._id))
            .collect();
          if (args.forReal) {
            await ctx.db.delete(doc._id);
            await map(chunks, (chunk) => ctx.db.delete(chunk._id));
          } else {
            console.log(
              "Would delete",
              doc._id,
              doc.url,
              new Date(doc._creationTime),
              "chunk count: " + chunks.length
            );
          }
        });
      }
    });
  },
});

// Hàm để phân tích trang
function parsePage(text: string) {
  const $ = load(text);
  return parse($, $(".markdown"))
    .replace(/(?:\n\s+){3,}/g, "\n\n")
    .trim();
}

// Hàm để phân tích nội dung
function parse($: CheerioAPI, element: any) {
  let result = "";

  $(element)
    .contents()
    .each((_, el) => {
      if (el.type === "text") {
        result += $(el).text().trim() + " ";
        return;
      }
      const tagName = (el as any).tagName;
      switch (tagName) {
        case "code":
          if ($(el).has("span").length > 0) {
            result +=
              "```\n" +
              $(el)
                .children()
                .map((_, line) => $(line).text())
                .get()
                .join("\n") +
              "\n```\n";
            return;
          }
          result += " `" + $(el).text() + "` ";
          return;
        case "a": {
          if ($(el).hasClass("hash-link")) {
            return;
          }
          let href = $(el).attr("href")!;
          if (href.startsWith("/")) {
            href = "https://docs.convex.dev" + href;
          }
          result += " [" + $(el).text() + "](" + href + ") ";
          return;
        }
        case "strong":
        case "em":
          result += " " + $(el).text() + " ";
          return;
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
          result += "#".repeat(+tagName.slice(1)) + " " + $(el).text() + "\n\n";
          return;
      }
      result += parse($, el);
      result += "\n\n";
    });

  return result;
}