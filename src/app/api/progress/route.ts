import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COOKIE_NAME } from "@/config";
import { makeGate, parseGate, serializeGate } from "@/gate/gate";

const Body = z.object({
  progress: z.number().int().min(0).optional(),
  advance: z.boolean().optional(), // the one-tap "I watched the next episode"
  rewatch: z.boolean().optional(),
  theories: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const b = body.data;

  const jar = await cookies();
  const cur = parseGate(jar.get(COOKIE_NAME)?.value) ?? makeGate({});
  const next = makeGate({
    progress: b.advance ? cur.progress + 1 : (b.progress ?? cur.progress),
    // Picking a specific episode leaves rewatch mode.
    rewatch: b.rewatch ?? (b.progress === undefined && !b.advance ? cur.rewatch : false),
    theories: b.theories ?? cur.theories,
  });

  jar.set(COOKIE_NAME, serializeGate(next), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json(next);
}
