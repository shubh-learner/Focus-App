import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focus — your calm YouTube dashboard",
  description: "A distraction-free, topic-organized YouTube dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper font-serif text-ink antialiased">{children}</body>
    </html>
  );
}
