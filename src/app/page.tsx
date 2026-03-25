import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/auth";

// 루트 페이지: 로그인 상태에 따라 리다이렉트
export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
