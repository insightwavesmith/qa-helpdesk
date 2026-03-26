import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/firebase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}
