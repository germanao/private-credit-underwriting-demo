import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl =
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://underwriting-workspace-demo.germanobenini12.chatgpt.site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Credit Underwriting | Synthetic private credit demo",
  description:
    "An evidence-first private credit underwriting workflow for Atlas Industrial Services.",
  openGraph: {
    title: "Private Credit Underwriting | Synthetic demo",
    description: "A synthetic, evidence-led review from source conflict to IC memo.",
    type: "website",
    url: "/deals",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Synthetic private credit underwriting evidence review workflow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Private Credit Underwriting | Synthetic demo",
    description: "A synthetic, evidence-led review from source conflict to IC memo.",
    images: ["/og.png"],
  },
  alternates: {
    canonical: "/deals",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
