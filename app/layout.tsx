import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deal Radar UK — Content Desk",
  description: "AI-assisted social content planning, approval and reporting for Deal Radar UK.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </body>
    </html>
  );
}
