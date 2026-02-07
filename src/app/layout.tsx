import type { Metadata, Viewport } from "next";
import ClientToaster from "@/components/layout/client-toaster";
import ThemeProvider from "@/components/layout/theme-provider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const META_THEME_COLOR = "#f8f9fc";

export const metadata: Metadata = {
  title: "BS CAMP",
  description: "BS CAMP 수강생 전용 Q&A 헬프데스크",
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-background overscroll-none font-sans antialiased">
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            forcedTheme="light"
            disableTransitionOnChange
            enableColorScheme
          >
            <ClientToaster />
            {children}
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
