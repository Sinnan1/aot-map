import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/config";
import { getDb } from "@/db/client";
import { parseGate } from "@/gate/gate";
import { searchGated } from "@/gate/queries";

export async function GET(req: Request) {
  const gate = parseGate((await cookies()).get(COOKIE_NAME)?.value);
  if (!gate) return NextResponse.json([]);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await searchGated(await getDb(), gate, q));
}
