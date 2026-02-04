import { getCategories } from "@/actions/questions";
import { NewQuestionForm } from "./new-question-form";

export default async function NewQuestionPage() {
  const categories = await getCategories();

  return <NewQuestionForm categories={categories} />;
}
