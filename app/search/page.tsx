"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ContentCard from "@/components/ContentCard";
import ContentRow from "@/components/ContentRow";
import type { ContentItem } from "@/types";

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") || "";

  const [results, setResults] = useState<ContentItem[]>([]);
  const [trending, setTrending] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(q);
  const [hasSearched, setHasSearched] = useState(!!q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
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
      doSearch(q);
    }
  }, [q, doSearch]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      router.replace(`/search?q=${encodeURIComponent(val.trim())}`, { scroll: false });
      doSearch(val.trim());
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    doSearch(query.trim());
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    router.replace("/search", { scroll: false });
    inputRef.current?.focus();
  };

  // Derive category pills from trending
  const categories = Array.from(
    new Set(
      trending
        .map((t) => t.generalInfo?.category || t.generalInfo?.type)
        .filter(Boolean)
    )
  ).slice(0, 10) as string[];

  return (
    <div className="min-h-screen bg-[#0f0f0f] pb-16">
      {/* Search header */}
      <div className="px-4 sm:px-8 pt-6 pb-4 max-w-350 mx-auto">
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
            {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
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
            Try &ldquo;Vijay&rdquo;, &ldquo;KGF&rdquo; or &ldquo;Sun TV&rdquo;
          </p>
        </div>
      )}

      {/* Default state — trending + categories */}
      {!hasSearched && !loading && (
        <>
          {/* Category pills */}
          {categories.length > 0 && (
            <div className="px-4 sm:px-8 max-w-350 mx-auto mb-6">
              <h2 className="text-white font-bold text-sm sm:text-base mb-3">Browse by Category</h2>
              <div className="flex flex-wrap gap-2">
                {categories.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => { setQuery(tag); handleChange(tag); }}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full transition-colors capitalize border border-gray-700 hover:border-red-500"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trending row — matches rest of app */}
          {trending.length > 0 && (
            <ContentRow
              title="Trending Now"
              items={trending}
              layout="landscape"
            />
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
