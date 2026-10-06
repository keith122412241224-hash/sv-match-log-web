import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { CreatorError, creatorClient, databaseError, getCreatorData, cleanCreatorStorage } from "@/lib/creator/server";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES, UUID, parseTierDocument, validateImageFile } from "@/lib/creator/model";

export const runtime = "nodejs";
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  return response({ error: error instanceof Error ? error.message : "処理に失敗しました。" }, error instanceof CreatorError ? error.status : 400);
}
function id(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new CreatorError("IDが不正です。");
  return value;
}
function revision(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new CreatorError("更新番号が不正です。");
  return n;
}
function name(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) throw new CreatorError("画像名は1〜120文字で入力してください。");
  return value.trim();
}
function conflict(data: unknown) {
  if (!data) throw new CreatorError("別の画面で更新・削除されています。再読み込みしてからやり直してください。", 409);
}

export async function GET() {
  try { const { client } = await creatorClient(); return response(await getCreatorData(client)); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    // Cookie-authenticated writes must originate from this application.
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new CreatorError("操作元を確認できませんでした。", 403);
    const { client, user } = await creatorClient();
    if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES + 65536) throw new CreatorError("画像は1枚4MB以下にしてください。", 413);
    // Enforce the same bound for chunked requests without a Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new CreatorError("リクエストが空です。");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_BYTES + 65536) { await reader.cancel(); throw new CreatorError("画像は1枚4MB以下にしてください。", 413); }
      chunks.push(value);
    }
    const bodyRequest = new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) });
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await bodyRequest.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new CreatorError("画像を選択してください。");
      const { mime, extension } = validateImageFile(file);
      const bytes = Buffer.from(await file.arrayBuffer());
      const decoder = sharp(bytes, { limitInputPixels: 24000000, animated: false, failOn: "warning" });
      const metadata = await decoder.metadata();
      if (metadata.format !== (extension === "jpg" ? "jpeg" : extension) || (metadata.pages ?? 1) > 1) throw new CreatorError("画像の内容が形式と一致しないか、アニメーション画像です。");
      // Fully decode before upload. Metadata inspection alone accepts truncated files.
      await decoder.clone().stats();
      const imageId = form.get("id") ? id(form.get("id")) : randomUUID();
      const oldRevision = form.get("id") ? revision(form.get("revision")) : null;
      const objectPath = `${randomUUID()}.${extension}`;
      // Register before uploading, so interruption at any later step is recoverable.
      const pending = await client.from("creator_storage_cleanup").insert({ object_path: objectPath, ready_after: new Date(Date.now() + 3600000).toISOString() });
      databaseError(pending.error);
      const upload = await client.storage.from(IMAGE_BUCKET).upload(objectPath, bytes, { contentType: mime, upsert: false });
      if (upload.error) throw new CreatorError("画像アップロードに失敗しました。旧画像は保持されています。", 503);
      const result = oldRevision
        ? await client.from("creator_images").update({ object_path: objectPath }).eq("id", imageId).eq("revision", oldRevision).select("id").maybeSingle()
        : await client.from("creator_images").insert({ id: imageId, name: name(form.get("name") || file.name), object_path: objectPath, created_by: user.id }).select("id").single();
      databaseError(result.error); conflict(result.data);
      await client.from("creator_storage_cleanup").delete().eq("object_path", objectPath);
    } else {
      const body = await bodyRequest.json();
      switch (body.action) {
        case "save": {
          const document = parseTierDocument(body.document);
          const result = body.id
            ? await client.from("creator_tier_works").update({ document }).eq("id", id(body.id)).eq("revision", revision(body.revision)).select("*").maybeSingle()
            : await client.from("creator_tier_works").insert({ document, created_by: user.id }).select("*").single();
          databaseError(result.error); conflict(result.data);
          return response({ work: result.data });
        }
        case "delete-work": {
          const result = await client.from("creator_tier_works").delete().eq("id", id(body.id)).eq("revision", revision(body.revision)).select("id").maybeSingle();
          databaseError(result.error); conflict(result.data); break;
        }
        case "edit-image": {
          const result = await client.from("creator_images").update({ name: name(body.name), archetype_id: body.archetypeId ? id(body.archetypeId) : null }).eq("id", id(body.id)).eq("revision", revision(body.revision)).select("id").maybeSingle();
          databaseError(result.error); conflict(result.data); break;
        }
        case "delete-image": {
          const result = await client.from("creator_images").delete().eq("id", id(body.id)).eq("revision", revision(body.revision)).select("id").maybeSingle();
          databaseError(result.error); conflict(result.data); break;
        }
        case "cleanup": break;
        default: throw new CreatorError("操作が不正です。");
      }
    }
    const cleaned = await cleanCreatorStorage(client);
    return response({ ...(await getCreatorData(client)), warning: cleaned ? null : "操作は保存されました。旧ファイルの削除が保留中です。「ストレージ整理を再試行」で再実行できます。" });
  } catch (error) { return failure(error); }
}
