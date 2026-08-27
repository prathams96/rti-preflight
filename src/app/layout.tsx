import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RTI Preflight — find out before you file",
  description:
    "Check published government sources before filing an RTI. Independent prototype.",
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
