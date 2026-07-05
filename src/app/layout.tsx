import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import AdminButton from "@/components/AdminButton";
import CustomizeButton from "@/components/CustomizeButton";
import { FlyonUIInit } from "@/components/FlyonUIInit";
import { auth } from "@/auth";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Payload",
  description: "Provide sandboxed desktop VMs for reviewers",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen flex flex-col font-sans bg-hc-darker text-hc-smoke selection:bg-hc-red selection:text-white">
        <FlyonUIInit />
        {session?.user && (
          <nav className="bg-hc-dark border-b border-hc-darkless px-6 py-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center">
               <Link className="text-2xl font-bold tracking-tight text-hc-red" href="/">Payload</Link>
            </div>
             <div className="flex items-center gap-3">
                <CustomizeButton />
                <AdminButton />
                <UserMenu />
             </div>
          </nav>
        )}
        <main className="flex-1 max-w-4xl mx-auto w-full py-12 px-6">
          {children}
        </main>
      </body>
    </html>
  );
}

