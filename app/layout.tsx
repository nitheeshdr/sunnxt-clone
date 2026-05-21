import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Sun NXT - Watch Tamil, Telugu, Malayalam Movies & TV Shows Online",
  description:
    "Watch your favourite Tamil, Telugu, Malayalam, Kannada movies, TV shows and Live TV channels online on Sun NXT.",
};

async function getUserProfile(cookieHeader: string) {
  try {
    const res = await fetch("https://pwaapi.sunnxt.com/user/v2/profile", {
      headers: {
        "x-myplex-platform": "browser",
        "x-ucv": "5",
        origin: "https://www.sunnxt.com",
        cookie: cookieHeader,
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result?.profile ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const userProfile = cookieHeader ? await getUserProfile(cookieHeader) : null;

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-[#0f0f0f] text-white antialiased">
        <Navbar userProfile={userProfile} />
        <main className="pt-16">{children}</main>
        <footer className="mt-16 border-t border-gray-800 py-8 px-8 text-center text-gray-500 text-sm">
          <p>© 2024 Sun NXT. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
