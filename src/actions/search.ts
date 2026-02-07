"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function searchQuestions(query: string, limit = 5) {
  if (!query || query.trim().length < 1) {
    return { data: [], error: null };
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, title, status, category:qa_categories!questions_category_id_fkey(name, slug)"
    )
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("searchQuestions error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

export async function getPopularQuestions(limit = 5) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, title, status, view_count, answers_count:answers(count), category:qa_categories!questions_category_id_fkey(name, slug)"
    )
    .order("view_count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getPopularQuestions error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}
