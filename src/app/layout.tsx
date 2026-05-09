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
    <html lang="en" data-theme="payload" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-base-100 text-base-content relative">
        <FlyonUIInit />
        <header className="navbar bg-base-200 border-b border-base-300 px-4 md:px-8">
          <div className="flex-1 flex items-center gap-3">
             <div className="bg-primary w-6 h-6 rounded-sm"></div>
             <span className="text-xl font-bold text-base-content tracking-tight">Payload</span>
          </div>
          <div className="flex-none">
             <UserMenu />
          </div>
        </header>
        <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
          {children}
        </main>
      </body>
    </html>
  );
}

