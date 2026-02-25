import Image from "next/image";

interface PostHeroProps {
  title: string;
  category?: string;
  thumbnailUrl?: string | null;
}

export function PostHero({ title, category, thumbnailUrl }: PostHeroProps) {
  const isOgFallback = !thumbnailUrl;
  return (
    <Image
      src={thumbnailUrl || `/api/og?title=${encodeURIComponent(title)}${category ? `&category=${encodeURIComponent(category)}` : ""}`}
      alt={title}
      width={1200}
      height={630}
      className="w-full rounded-lg"
      unoptimized={isOgFallback}
    />
  );
}
