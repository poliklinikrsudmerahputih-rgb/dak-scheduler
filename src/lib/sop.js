import { cookies } from "next/headers";
import { parseSessionValue } from "@/lib/session";

export async function getSopRuangan(allowPublicRead = false) {
  const session = (await cookies()).get("session_dak_pro");
  if (!session) {
    return allowPublicRead ? "POLIKLINIK" : null;
  }

  const sessionData = parseSessionValue(session);
  const ruangan = String(sessionData?.ruangan || "").trim().toUpperCase();
  return ruangan || null;
}
