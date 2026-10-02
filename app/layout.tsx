import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShelfRadar — AI retail agent powered by Exa",
  description:
    "An AI agent app for retail price intelligence, powered by agentic search with the Exa API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
