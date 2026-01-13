import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../types";

type RegisterResponse = { token: string; user: AuthUser };

export default function Register() {
  const nav = useNavigate();
  const { setAuth } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Please fill all fields.");
      return;
    }

    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post<RegisterResponse>("/api/auth/register", {
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
      });

      setAuth(res.data.token, res.data.user);
      nav("/chat");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) {
      setError("Register failed. Try a different email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-4">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-lg md:grid-cols-2">
          {/* Left panel */}
          <div className="hidden md:flex flex-col justify-between bg-slate-900 p-10 text-white">
            <div>
              <div className="text-2xl font-bold">Create your account</div>
              <div className="mt-3 text-slate-200">
                Start chatting in realtime with Socket.IO.
              </div>
            </div>

            <div className="text-sm text-slate-200">
              Tip: use a test email like <b>dinushka2@test.com</b>
            </div>
          </div>

          {/* Form */}
          <div className="p-6 sm:p-10">
            <div className="mb-6">
              <div className="text-2xl font-bold text-slate-900">Register</div>
              <div className="text-sm text-slate-500">It takes 1 minute</div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dinushka"
                  className="mt-1 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dinushka@test.com"
                  className="mt-1 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 6 chars"
                  type="password"
                  className="mt-1 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create Account"}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-emerald-700 hover:underline"
              >
                Sign in
              </Link>
            </div>

            <div className="mt-8 text-center text-xs text-slate-400">
              Connectly • Realtime Messaging
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
