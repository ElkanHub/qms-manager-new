import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Self-hosted Inter (variable) — no build-time Google Fonts fetch, so builds never
// fail on a flaky network. The font file lives in the repo under ./fonts.
const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QMS Manager",
  description: "GxP-compliant quality management system — document control platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
