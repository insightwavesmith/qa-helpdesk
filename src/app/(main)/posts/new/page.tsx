import { getCurrentUser } from "@/lib/firebase/auth";
import { redirect } from "next/navigation";
import { NewPostForm } from "./new-post-form";

export default async function NewPostPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <NewPostForm />;
}
