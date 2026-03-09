import { redirect } from "next/navigation";

export default function NoticesPage() {
  redirect("/posts?category=notice");
}
