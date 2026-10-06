import { creatorClient, CreatorError, databaseError } from "@/lib/creator/server";
import { IMAGE_BUCKET, UUID } from "@/lib/creator/model";
import { getDisplayImage } from "@/lib/creator/display-image";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await creatorClient();
    const { id } = await params;
    if (!UUID.test(id)) return new Response(null, { status: 404 });
    const { data, error } = await client.from("creator_images").select("object_path").eq("id", id).maybeSingle();
    databaseError(error);
    if (!data) return new Response(null, { status: 404 });
    const readOriginal = async () => {
      const result = await client.storage.from(IMAGE_BUCKET).download(data.object_path);
      if (result.error || !result.data) throw new CreatorError("画像を取得できませんでした。", 503);
      return { bytes: new Uint8Array(await result.data.arrayBuffer()), type: result.data.type, trimmed: false };
    };
    const image = new URL(request.url).searchParams.get("variant") === "original"
      ? await readOriginal() : await getDisplayImage(data.object_path, readOriginal);
    return new Response(new Uint8Array(image.bytes), { headers: { "Content-Type": image.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Creator-Image-Variant": image.trimmed ? "trimmed" : "original" } });
  } catch (error) { return new Response(null, { status: error instanceof CreatorError ? error.status : 500 }); }
}
