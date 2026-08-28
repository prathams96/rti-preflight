import type { Metadata } from "next";
import { Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "RTI Tathya — find out before you file",
  description:
    "RTI Tathya is an independent prototype that checks published government sources before filing an RTI.",
  openGraph: {
    title: "RTI Tathya — find out before you file",
    description:
      "An independent prototype for checking published government sources before filing an RTI.",
    type: "website",
    siteName: "RTI Tathya",
    images: [
      {
        url: "/rti-tathya-logo.png",
        width: 1254,
        height: 1254,
        alt: "RTI Tathya logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RTI Tathya — find out before you file",
    description:
      "An independent prototype for checking published government sources before filing an RTI.",
    images: ["/rti-tathya-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={devanagari.variable}>
      <body>{children}</body>
    </html>
  );
}
