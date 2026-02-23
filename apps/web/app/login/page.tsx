"use client";

import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import Image from "next/image";
import logo from "../../assets/logo.png";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const r = await login(username.trim(), password);
      if (!r.ok) setMsg(r.error || "Usuario o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center text-gray-200 p-4"
      style={{
        background:
          "radial-gradient(900px 420px at 20% 10%, rgba(0,255,255,.14), transparent 55%), radial-gradient(900px 420px at 80% 0%, rgba(255,0,255,.12), transparent 55%), linear-gradient(180deg, #090A1A 0%, #060716 100%)",
      }}
    >
      {/* Card */}
      <div
        className="w-full max-w-md rounded-3xl p-6 sm:p-7"
        style={{
          backgroundColor: "rgba(20,22,58,.82)",
          border: "1px solid #1E1F4B",
          boxShadow:
            "0 0 24px rgba(0,255,255,.12), 0 0 24px rgba(255,0,255,.08)",
          backdropFilter: "blur(10px)",
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          {/* ✅ Logo cuadrado con marco cuadrado suave (igual al sidebar) */}
          <div
            className="rounded-2xl p-[2px]"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,255,255,.75), rgba(255,0,255,.75))",
              boxShadow:
                "0 0 18px rgba(0,255,255,.22), 0 0 18px rgba(255,0,255,.16)",
            }}
          >
            <Image
              src={logo}
              alt="Gamerland"
              width={92}
              height={92}
              className="rounded-xl bg-[#0F1030]"
              priority
            />
          </div>

          <h1 className="text-neon font-extrabold text-3xl tracking-wide text-center">
            GAMERLAND POS
          </h1>
          <p className="text-[12px] text-neon-2 tracking-[0.22em] opacity-80 text-center">
            TIERRA SOÑADA DE JUGADORES
          </p>

          {/* Badge mini */}
          <div className="mt-2 text-[11px] text-gray-300">
            <span className="px-2.5 py-1 rounded-full border border-eon bg-[#0F1030]/60">
              Acceso al sistema
            </span>
          </div>
        </div>

        {/* Form */}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="Usuario">
            <input
              className="w-full rounded-xl px-3 py-2.5 outline-none text-gray-100"
              style={{
                backgroundColor: "rgba(15,16,48,.75)",
                border: "1px solid #1E1F4B",
                boxShadow: "inset 0 0 0 1px rgba(0,255,255,.06)",
              }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="Tu usuario"
            />
          </Field>

          <Field label="Contraseña">
            <div className="relative">
              <input
                className="w-full rounded-xl px-3 py-2.5 pr-12 outline-none text-gray-100"
                style={{
                  backgroundColor: "rgba(15,16,48,.75)",
                  border: "1px solid #1E1F4B",
                  boxShadow: "inset 0 0 0 1px rgba(255,0,255,.05)",
                }}
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />

              {/* Toggle */}
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-xs border border-eon text-gray-300 hover:text-gray-100 hover:bg-[#1E1F4B] transition"
                onClick={() => setShowPwd((v) => !v)}
                title={showPwd ? "Ocultar" : "Mostrar"}
              >
                {showPwd ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </Field>

          {/* Error */}
          {!!msg && (
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: "rgba(255,0,255,.08)",
                border: "1px solid rgba(255,0,255,.20)",
                color: "#FF7CFF",
              }}
            >
              {msg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl font-extrabold disabled:opacity-60 active:scale-[.99] transition"
            style={{
              color: "#001014",
              background:
                "linear-gradient(90deg, rgba(0,255,255,0.92), rgba(255,0,255,0.92))",
              boxShadow:
                "0 0 18px rgba(0,255,255,.28), 0 0 26px rgba(255,0,255,.22)",
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          {/* Hint */}
          <div className="text-center text-[11px] text-gray-400 pt-1">
            Usa tus credenciales asignadas por{" "}
            <span className="text-neon-2 font-semibold">Gamerland</span>.
          </div>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          © 2026 GAMERLAND PC
        </div>
      </div>
    </div>
  );
}

/* ===== UI mini components ===== */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
