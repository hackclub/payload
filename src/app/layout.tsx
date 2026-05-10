import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import UserMenu from "@/components/UserMenu";
import { FlyonUIInit } from "@/components/FlyonUIInit";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Payload | Hack Club",
  description: "Provide sandboxed desktop VMs for reviewers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-hc-darker text-hc-smoke selection:bg-hc-red selection:text-white">
        <FlyonUIInit />
        <nav className="bg-hc-dark border-b border-hc-darkless px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center">
             <span className="text-2xl font-bold tracking-tight text-hc-red ">Payload</span>
          </div>
          <div className="flex items-center">
             <UserMenu />
          </div>
        </nav>
        <main className="flex-1 max-w-4xl mx-auto w-full py-12 px-6">
          {children}
        </main>
      </body>
    </html>
  );
}

