"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

const NAV_ITEMS = [
  {
    label: "Home", href: "/",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  },
  {
    label: "Movies", href: "/movie",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />,
  },
  {
    label: "TV Shows", href: "/tv",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  },
  {
    label: "Live TV", href: "/live",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />,
  },
  {
    label: "Free", href: "/free",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />,
  },
  {
    label: "Music Videos", href: "/music",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19V6l12-3v13M9 19c0 1.105-.895 2-2 2s-2-.895-2-2 .895-2 2-2 2 .895 2 2zm12-3c0 1.105-.895 2-2 2s-2-.895-2-2 .895-2 2-2 2 .895 2 2z" />,
  },
  {
    label: "Shorts", href: "/shorts",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />,
  },
];

const LANGUAGES = ["All Languages", "Tamil", "Telugu", "Malayalam", "Kannada", "Hindi"];

interface NavbarProps {
  userProfile?: {
    first: string;
    profilePicture?: string;
    subscriptionStatus?: string;
  } | null;
}

export default function Navbar({ userProfile }: NavbarProps) {
  const [scrolled, setScrolled]       = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [langOpen, setLangOpen]       = useState(false);
  const [language, setLanguage]       = useState("Languages");
  const router   = useRouter();
  const pathname = usePathname();
  const profileRef = useRef<HTMLDivElement>(null);
  const langRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (langRef.current    && !langRef.current.contains(e.target as Node))    setLangOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#0d0d0d]/98 shadow-lg" : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-5">
        <div className="flex items-center h-14 gap-1 sm:gap-2">

          {/* Logo */}
          <Link href="/" className="shrink-0 mr-1 sm:mr-3">
            <div className="flex items-center">
              <div className="bg-red-600 rounded px-1.5 py-0.5">
                <span className="text-white font-black text-sm tracking-tight leading-none">SUN</span>
              </div>
              <div className="bg-white rounded px-1.5 py-0.5 ml-0.5">
                <span className="text-red-600 font-black text-sm tracking-tight leading-none">NXT</span>
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1 px-2 xl:px-2.5 py-1.5 rounded text-xs xl:text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active ? "text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right-side actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            {/* SUBSCRIBE */}
            <Link
              href="/login"
              className="hidden sm:flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-[11px] xl:text-xs px-2.5 xl:px-3 py-1.5 rounded transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              SUBSCRIBE
            </Link>

            {/* Languages dropdown */}
            <div ref={langRef} className="relative hidden md:block">
              <button
                onClick={() => setLangOpen((v) => !v)}
                className="flex items-center gap-1 text-gray-300 hover:text-white text-[11px] xl:text-xs font-medium px-2 py-1.5 rounded hover:bg-white/10 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                {language}
                <svg className={`w-3 h-3 transition-transform ${langOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[140px] overflow-hidden">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => { setLanguage(lang === "All Languages" ? "Languages" : lang); setLangOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs hover:bg-white/10 transition-colors ${
                        (language === lang || (language === "Languages" && lang === "All Languages"))
                          ? "text-red-500 font-semibold" : "text-gray-300"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <button
              onClick={() => router.push("/search")}
              className="text-gray-300 hover:text-white p-2 transition-colors"
              aria-label="Search"
            >
              <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Profile */}
            {userProfile ? (
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
                >
                  {userProfile.profilePicture ? (
                    <Image src={userProfile.profilePicture} alt={userProfile.first} width={28} height={28} className="rounded-full object-cover" unoptimized />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-xs">
                      {userProfile.first[0]?.toUpperCase()}
                    </div>
                  )}
                  <svg className={`w-3 h-3 hidden sm:block transition-transform ${profileOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-44 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-2xl py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-700">
                      <p className="text-white font-medium text-sm">{userProfile.first}</p>
                      {userProfile.subscriptionStatus && (
                        <p className="text-green-400 text-xs mt-0.5">{userProfile.subscriptionStatus}</p>
                      )}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className="hidden sm:block bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors">
                Sign In
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              className="lg:hidden text-gray-300 hover:text-white p-1"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="lg:hidden bg-[#111] border-t border-gray-800 py-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 text-sm ${
                  pathname === item.href ? "text-white font-semibold" : "text-gray-400 hover:text-white"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            ))}
            <div className="border-t border-gray-800 pt-2 mt-1 px-5">
              <Link href="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-yellow-400 font-bold text-sm py-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                SUBSCRIBE
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
