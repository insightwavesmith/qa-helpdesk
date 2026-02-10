interface PostHeroProps {
  title: string;
  category?: string;
  thumbnailUrl?: string | null;
}

export function PostHero({ title, category, thumbnailUrl }: PostHeroProps) {
  return (
    <img
      src={thumbnailUrl || `/api/og?title=${encodeURIComponent(title)}${category ? `&category=${encodeURIComponent(category)}` : ""}`}
      alt={title}
      className="w-full rounded-lg"
    />
  );
}
