"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Step = "mobile" | "password";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{
    login_account_type?: string;
    subscription_status?: string;
  } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/";

  const checkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/status?mobile=${encodeURIComponent(mobile)}`);
      const data = await res.json();
      if (data.code === 200 && data.user_available) {
        setAccountInfo({
          login_account_type: data.login_account_type,
          subscription_status: data.subscription_status,
        });
        setStep("password");
      } else {
        setError("Account not found. Please check your mobile number.");
      }
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: mobile, password }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(nextUrl);
        router.refresh();
      } else {
        setError(data.error || "Invalid credentials. Please try again.");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block">
            <span className="text-4xl font-black text-white tracking-tight">SUN</span>
            <span className="text-4xl font-black text-red-600 tracking-tight">NXT</span>
          </Link>
          <p className="text-gray-400 text-sm mt-3">
            Sign in to access your account
          </p>
        </div>

        <div className="bg-gray-900/80 rounded-2xl p-8 border border-gray-800 shadow-2xl">
          {step === "mobile" ? (
            <form onSubmit={checkAccount} className="space-y-5">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Mobile Number or Email
                </label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="Enter your mobile number"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 px-4 py-3 rounded-xl text-sm outline-none border border-gray-700 focus:border-red-500 transition-colors"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg border border-red-900/30">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !mobile.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={doLogin} className="space-y-5">
              {/* Show mobile */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-gray-400 text-xs">Signing in as</p>
                  <p className="text-white font-medium text-sm">{mobile}</p>
                  {accountInfo?.subscription_status && (
                    <span className="text-green-400 text-xs">
                      {accountInfo.subscription_status}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setStep("mobile"); setError(""); setPassword(""); }}
                  className="text-red-400 hover:text-red-300 text-xs underline"
                >
                  Change
                </button>
              </div>

              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 px-4 py-3 rounded-xl text-sm outline-none border border-gray-700 focus:border-red-500 transition-colors"
                  autoFocus
                  required
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg border border-red-900/30">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Content browsing works without signing in.{" "}
          <Link href="/" className="text-red-400 hover:text-red-300">
            Browse now
          </Link>
        </p>
      </div>
    </div>
  );
}
