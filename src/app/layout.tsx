import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistPixel = localFont({
  src: "../../public/sites/odama/fonts/GeistPixel-latin.woff2",
  variable: "--font-geist-pixel",
  weight: "400",
  display: "swap",
});

const spaceMono = localFont({
  src: [
    { path: "../../public/sites/odama/fonts/SpaceMono-400-latin.woff2", weight: "400" },
    { path: "../../public/sites/odama/fonts/SpaceMono-700-latin.woff2", weight: "700" },
  ],
  variable: "--font-space",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Odama Studio - UI/UX, Web & Product Design Studio",
  description:
    "Design studio in Indonesia helping teams turn complex ideas into clear, usable digital products. UI/UX, websites, mobile apps and branding.",
  applicationName: "Odama",
  icons: {
    icon: [
      { url: "/sites/odama/favicon.svg", type: "image/svg+xml" },
      { url: "/sites/odama/favicon-light.png", type: "image/png", sizes: "96x96", media: "(prefers-color-scheme: light)" },
      { url: "/sites/odama/favicon-dark.png", type: "image/png", sizes: "96x96", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/sites/odama/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistPixel.variable} ${spaceMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          // Mirrors the source: page-level reveals only hide content once JS is running.
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
