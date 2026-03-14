import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import ClientToaster from "@/components/layout/client-toaster";
import ThemeProvider from "@/components/layout/theme-provider";
import MixpanelProvider from "@/components/mixpanel-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

const META_THEME_COLOR = "#f8f9fc";

export const metadata: Metadata = {
  title: "자사몰사관학교",
  description: "자사몰사관학교 수강생 전용 Q&A 헬프데스크",
  verification: {
    google: "P0GjNhgUWMBu2HXupiqnIjKb9f7CbZe4B3Bm6zEiXvc",
    other: {
      "naver-site-verification": "6a4061654e73ee852828f8e371a5a0c26660915f",
    },
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "자사몰사관학교",
    description:
      "메타 광고 전문 교육 플랫폼. 자사몰 운영자를 위한 실전 광고 전략과 Q&A 헬프데스크.",
    url: "https://bscamp.vercel.app",
    siteName: "자사몰사관학교",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "자사몰사관학교",
    description:
      "메타 광고 전문 교육 플랫폼. 자사몰 운영자를 위한 실전 광고 전략과 Q&A 헬프데스크.",
  },
};

export const viewport: Viewport = {
  themeColor: META_THEME_COLOR,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <body className="bg-background overscroll-none font-sans antialiased">
        <JsonLd />
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            forcedTheme="light"
            disableTransitionOnChange
            enableColorScheme
          >
            <MixpanelProvider />
            <ClientToaster />
            {children}
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
