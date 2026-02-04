import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 루트 페이지: 로그인 상태에 따라 리다이렉트
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
