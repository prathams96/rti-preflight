import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RTI Preflight",
  description:
    "An independent research and drafting assistant for RTI applicants in India.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
