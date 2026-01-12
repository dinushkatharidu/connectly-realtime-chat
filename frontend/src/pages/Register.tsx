import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "../types";

type RegisterResponse = { token: string; user: User };

export default function Register() {
  const [name, setName] = useState("Dinushka");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);

  const { setAuth } = useAuth();
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const res = await api.post<RegisterResponse>("/api/auth/register", {
        name,
        email,
        password,
      });
      setAuth(res.data.token, res.data.user);
      nav("/chat");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err?.response?.data?.message || "Register failed");
    }
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "sans-serif",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <h2>Register</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
        />
        <button type="submit">Create Account</button>
        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </form>

      <p style={{ marginTop: 10 }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
