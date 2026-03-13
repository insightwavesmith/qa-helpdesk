"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getOrganicPost } from "@/actions/organic";
import OrganicPostEditor from "@/components/organic/organic-post-editor";
import type { OrganicPost } from "@/types/organic";

export default function OrganicPostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const isNew = postId === "new";

  const [post, setPost] = useState<OrganicPost | null>(null);
  const [loading, setLoading] = useState(!isNew);

  const loadPost = useCallback(async () => {
    if (isNew) return;
    try {
      const result = await getOrganicPost(postId);
      if (result.error || !result.data) {
        router.push("/admin/organic?tab=posts");
        return;
      }
      setPost(result.data);
    } catch {
      router.push("/admin/organic?tab=posts");
    } finally {
      setLoading(false);
    }
  }, [postId, isNew, router]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-500">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  if (!isNew && !post) return null;

  return <OrganicPostEditor post={post} isNew={isNew} />;
}
