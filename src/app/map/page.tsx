import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/config";
import { MapApp } from "@/components/MapApp";
import { getDb } from "@/db/client";
import { parseGate } from "@/gate/gate";
import { loadGatedGraph } from "@/gate/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const gate = parseGate((await cookies()).get(COOKIE_NAME)?.value);
  if (!gate) redirect("/");
  // Only gated data crosses this line. See src/gate/queries.ts.
  const graph = await loadGatedGraph(await getDb(), gate);
  return <MapApp graph={graph} />;
}
