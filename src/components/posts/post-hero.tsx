interface PostHeroProps {
  title: string;
}

export function PostHero({ title }: PostHeroProps) {
  return (
    <div className="w-full rounded-lg bg-gradient-to-r from-[#F75D5D] to-[#E54949] px-8 py-12 sm:py-16">
      <h1 className="text-2xl sm:text-[32px] font-bold text-white leading-tight text-center max-w-3xl mx-auto">
        {title}
      </h1>
    </div>
  );
}
