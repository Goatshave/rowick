import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Rowick Next.js Server Export",
  description: "Runnable Next.js server export integration for Rowick.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
