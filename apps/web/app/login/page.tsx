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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await login(username.trim(), password);
    if (!r.ok) setMsg(r.error || "Usuario o contraseña incorrectos");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0B24] text-gray-200 p-4">
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-lg"
        style={{
          backgroundColor: "#14163A",
          border: "1px solid #1E1F4B",
          boxShadow:
            "0 0 22px rgba(0,255,255,.10), inset 0 0 18px rgba(255,0,255,.06)",
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <Image
            src={logo}
            alt="Gamerland"
            width={140}
            height={140}
            className="rounded-full shadow-[0_0_25px_rgba(0,255,255,0.4)]"
          />
          <h1 className="text-neon font-extrabold text-3xl tracking-wide">
            GAMERLAND POS
          </h1>
          <p className="text-[13px] text-neon-2 tracking-widest opacity-80">
            TIERRA SOÑADA DE JUGADORES
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Usuario</label>
            <input
              className="w-full rounded px-3 py-2 outline-none text-gray-100"
              style={{
                backgroundColor: "#0F1030",
                border: "1px solid #1E1F4B",
              }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <input
                className="w-full rounded px-3 py-2 pr-10 outline-none text-gray-100"
                style={{
                  backgroundColor: "#0F1030",
                  border: "1px solid #1E1F4B",
                }}
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200"
                onClick={() => setShowPwd((v) => !v)}
                title={showPwd ? "Ocultar" : "Mostrar"}
              >
                {showPwd ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg font-semibold"
            style={{
              color: "#001014",
              background:
                "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
              boxShadow:
                "0 0 18px rgba(0,255,255,.35), 0 0 28px rgba(255,0,255,.25)",
            }}
          >
            Ingresar
          </button>

          {!!msg && <div className="text-sm text-pink-300">{msg}</div>}
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          © 2025 GAMERLAND PC
        </div>
      </div>
    </div>
  );
}
