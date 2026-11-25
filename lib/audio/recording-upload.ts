// POST /api/assets: one kept recording as multipart (file, opportunityId,
// sessionId, questionKey). The body is read under a byte cap before it is
// parsed, so a lying Content-Length cannot make the server buffer more.
import { z } from "zod";
import type { Scoped } from "@/lib/db/scoped";
import { RECORDING_MAX_BYTES } from "@/lib/prep/values";
import { storeRecording } from "./recordings";
import type { Storage } from "@/lib/storage/driver";

// Room for the multipart framing around a file of RECORDING_MAX_BYTES.
const BODY_CAP = RECORDING_MAX_BYTES + 65_536;

const fieldsSchema = z.object({
  opportunityId: z.string().uuid(),
  sessionId: z.string().uuid(),
  questionKey: z.string().regex(/^[0-9a-f]{16}$/),
});

function json(body: object, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
const tooLarge = () => json({ error: "The recording is too large." }, 413);

async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function handleRecordingUpload(
  s: Scoped,
  deps: { storage: Storage; randomHex(bytes: number): string },
  request: Request,
): Promise<Response> {
  const raw = await readCapped(request, BODY_CAP);
  if (raw === null) return tooLarge();

  let form: FormData;
  try {
    form = await new Response(raw as BodyInit, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return json({ error: "The upload is not a form." }, 400);
  }
  const file = form.get("file");
  const fields = fieldsSchema.safeParse({
    opportunityId: form.get("opportunityId"),
    sessionId: form.get("sessionId"),
    questionKey: form.get("questionKey"),
  });
  if (!(file instanceof Blob) || !fields.success) return json({ error: "The upload is missing a field." }, 400);
  if (file.size > RECORDING_MAX_BYTES) return tooLarge();

  const result = await storeRecording(s, deps, {
    ...fields.data,
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  if (result.ok) return json({ assetId: result.data.assetId }, 201);
  const status = result.code === "too_large" ? 413 : result.code === "not_found" ? 404 : 400;
  return json({ error: result.message }, status);
}
