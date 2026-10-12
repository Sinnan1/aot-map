import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/config";
import { EpisodeGate } from "@/components/EpisodeGate";
import { parseGate } from "@/gate/gate";

export const dynamic = "force-dynamic";

export default async function Entry() {
  const gate = parseGate((await cookies()).get(COOKIE_NAME)?.value);
  return <EpisodeGate current={gate} />;
}
