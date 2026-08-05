import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transformer: How Generative AI Works",
  description:
    "An interactive 3D simulation that runs a miniature transformer in real time: tokenizer docks, attention plaza, KV-cache warehouse, feed-forward mill and the sampler.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
