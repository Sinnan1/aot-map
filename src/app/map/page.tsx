import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/config";
import { MapApp } from "@/components/MapApp";
import { getDb } from "@/db/client";
import { parseGate } from "@/gate/gate";
import { loadGatedEpisodes, loadGatedGraph } from "@/gate/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const gate = parseGate((await cookies()).get(COOKIE_NAME)?.value);
  if (!gate) redirect("/");
  const db = await getDb();
  // Only gated data crosses this line. See src/gate/queries.ts.
  const [graph, episodes] = await Promise.all([loadGatedGraph(db, gate), loadGatedEpisodes(db, gate)]);
  return <MapApp graph={graph} episodes={episodes} />;
}
