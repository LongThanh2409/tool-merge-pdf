import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "GộpPDF — Mọi tệp tin, một PDF",
  description: "Chuyển đổi, sắp xếp và gộp tài liệu, bảng tính, slide, PDF và hình ảnh thành một file PDF duy nhất.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "GộpPDF — Mọi tệp tin, một PDF",
    description: "Gộp Word, Excel, PowerPoint, PDF và hình ảnh thành một PDF duy nhất.",
    locale: "vi_VN",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "GộpPDF — Mọi tệp tin, một PDF" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
