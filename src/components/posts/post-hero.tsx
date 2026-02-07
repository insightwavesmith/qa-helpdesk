interface PostHeroProps {
  title: string;
  category?: string;
}

export function PostHero({ title, category }: PostHeroProps) {
  return (
    <img
      src={`/api/og?title=${encodeURIComponent(title)}${category ? `&category=${encodeURIComponent(category)}` : ""}`}
      alt={title}
      className="w-full rounded-lg"
    />
  );
}
