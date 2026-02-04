"use client";

import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";

interface HeroGreetingProps {
  userName: string;
}

export function HeroGreeting({ userName }: HeroGreetingProps) {
  return (
    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
      <AnimatedGradientText
        speed={1.5}
        colorFrom="#4f46e5"
        colorTo="#2563eb"
        className="text-2xl sm:text-3xl font-bold tracking-tight"
      >
        {userName}님, 무엇이 궁금하세요?
      </AnimatedGradientText>
    </h1>
  );
}
