import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Focus — your calm YouTube dashboard",
  description: "A distraction-free, topic-organized YouTube dashboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper font-serif text-ink antialiased">{children}</body>
    </html>
  );
}
