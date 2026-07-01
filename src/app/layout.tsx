import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QMS Manager",
  description: "GxP-compliant quality management system — document control platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
