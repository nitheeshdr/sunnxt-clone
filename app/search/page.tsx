"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ContentCard from "@/components/ContentCard";
import ContentRow from "@/components/ContentRow";
import type { ContentItem } from "@/types";

const CONTENT_TYPES = [
  { label: "All",         value: "",            icon: "🎬" },
  { label: "Movies",      value: "movie",       icon: "🎥" },
  { label: "TV Shows",    value: "tvepisode",   icon: "📺" },
  { label: "Comedy",      value: "comedy",      icon: "😂" },
  { label: "Music",       value: "musicvideo",  icon: "🎵" },
  { label: "Short Films", value: "shortfilm",   icon: "🎞️" },
  { label: "Live TV",     value: "live",        icon: "📡" },
];

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") || "";
  const typeParam = searchParams.get("type") || "";

  const [results, setResults] = useState<ContentItem[]>([]);
  const [trending, setTrending] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(q);
  const [activeType, setActiveType] = useState(typeParam);
  const [hasSearched, setHasSearched] = useState(!!q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (term: string, type: string) => {
    if (!term.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ q: term });
      if (type) params.set("type", type);
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/trending")
      .then((r) => r.json())
      .then((d) => setTrending(d.results || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (q) {
      setQuery(q);
      setActiveType(typeParam);
      doSearch(q, typeParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, typeParam]);

  const pushSearch = (term: string, type: string) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (type) params.set("type", type);
    const qs = params.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  };

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setHasSearched(false);
      pushSearch("", activeType);
      return;
    }
    debounceRef.current = setTimeout(() => {
      pushSearch(val.trim(), activeType);
      doSearch(val.trim(), activeType);
    }, 400);
  };

  const handleTypeChange = (type: string) => {
    setActiveType(type);
    if (query.trim()) {
      pushSearch(query.trim(), type);
      doSearch(query.trim(), type);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    pushSearch(query.trim(), activeType);
    doSearch(query.trim(), activeType);
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setActiveType("");
    router.replace("/search", { scroll: false });
    inputRef.current?.focus();
  };

  const typeLabel = CONTENT_TYPES.find((t) => t.value === activeType)?.label || "All";

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-16">
      {/* Search header */}
      <div className="px-4 sm:px-8 pt-6 pb-3 max-w-350 mx-auto">
        <h1 className="text-xl sm:text-2xl font-black text-white mb-4">Search</h1>

        {/* Search bar */}
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <svg
              className="absolute left-4 w-4 h-4 sm:w-5 sm:h-5 text-gray-500 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Movies, shows, channels..."
              className="w-full bg-gray-900 text-white placeholder-gray-500 pl-11 pr-10 py-3 sm:py-4 rounded-2xl text-sm sm:text-base outline-none border border-gray-700 focus:border-red-500 transition-colors"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-4 text-gray-500 hover:text-white transition-colors"
                aria-label="Clear"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Type filter tabs */}
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1" style={{ scrollbarWidth: "none" }}>
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTypeChange(t.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                activeType === t.value
                  ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700"
              }`}
            >
              <span className="text-sm">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 text-gray-400 py-20">
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Searching...</span>
        </div>
      )}

      {/* Search results grid */}
      {!loading && hasSearched && results.length > 0 && (
        <div className="px-4 sm:px-8 max-w-350 mx-auto">
          <p className="text-gray-500 text-xs sm:text-sm mb-4">
            {results.length} {typeLabel !== "All" ? typeLabel.toLowerCase() : "result"}{results.length !== 1 ? "s" : ""} for{" "}
            <span className="text-white font-medium">&ldquo;{q || query}&rdquo;</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {results.map((item) => (
              <ContentCard key={item._id} item={item} layout="landscape" size="sm" />
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && hasSearched && results.length === 0 && (
        <div className="text-center py-20 px-4">
          <p className="text-4xl sm:text-6xl mb-4">🎬</p>
          <p className="text-gray-400 text-base sm:text-lg font-semibold">No results found</p>
          <p className="text-gray-600 text-xs sm:text-sm mt-2">
            Try searching in a different category
          </p>
        </div>
      )}

      {/* Default state — trending + browse categories */}
      {!hasSearched && !loading && (
        <>
          <div className="px-4 sm:px-8 max-w-350 mx-auto mb-2">
            <h2 className="text-white font-bold text-sm sm:text-base mb-1">Browse by Type</h2>
            <p className="text-gray-500 text-xs sm:text-sm">
              Select a category above and search, or explore trending below
            </p>
          </div>

          {/* Type browse cards */}
          <div className="px-4 sm:px-8 max-w-350 mx-auto mb-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 sm:gap-3">
              {CONTENT_TYPES.filter((t) => t.value).map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setActiveType(t.value);
                    inputRef.current?.focus();
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 sm:p-5 rounded-2xl bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-red-600 transition-all group"
                >
                  <span className="text-2xl sm:text-3xl">{t.icon}</span>
                  <span className="text-gray-300 group-hover:text-white text-[11px] sm:text-xs font-medium text-center leading-tight">
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Trending row */}
          {trending.length > 0 && (
            <ContentRow title="Trending Now" items={trending} layout="landscape" />
          )}

          {trending.length === 0 && (
            <div className="text-center py-20 px-4">
              <p className="text-4xl sm:text-6xl mb-4">🔍</p>
              <p className="text-gray-500 text-sm sm:text-base">
                Search for Tamil, Telugu, Malayalam movies &amp; shows
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
