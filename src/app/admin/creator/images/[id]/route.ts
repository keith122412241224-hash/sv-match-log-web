import { creatorClient, CreatorError, databaseError } from "@/lib/creator/server";
import { IMAGE_BUCKET, UUID } from "@/lib/creator/model";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await creatorClient();
    const { id } = await params;
    if (!UUID.test(id)) return new Response(null, { status: 404 });
    const { data, error } = await client.from("creator_images").select("object_path").eq("id", id).maybeSingle();
    databaseError(error);
    if (!data) return new Response(null, { status: 404 });
    const result = await client.storage.from(IMAGE_BUCKET).download(data.object_path);
    if (result.error || !result.data) return new Response(null, { status: 503 });
    return new Response(result.data, { headers: { "Content-Type": result.data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return new Response(null, { status: error instanceof CreatorError ? error.status : 500 }); }
}
