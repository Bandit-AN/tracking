import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "MoonRift — Client Revenue Intelligence",
    description: "A modern multi-client sales and revenue performance dashboard.",
    icons: {
      icon: [{ url: "/moonriftmedia-logo.jpg", type: "image/jpeg" }],
      shortcut: "/moonriftmedia-logo.jpg",
      apple: "/moonriftmedia-logo.jpg",
    },
    openGraph: { title: "MoonRift", description: "Every client. One clear view.", images: [{ url: image, width: 1792, height: 915 }] },
    twitter: { card: "summary_large_image", title: "MoonRift", description: "Every client. One clear view.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${inter.variable} ${manrope.variable}`}>{children}</body></html>;
}
