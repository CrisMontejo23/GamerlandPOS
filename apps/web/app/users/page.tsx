"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth/AuthProvider";
import { apiFetch } from "../lib/api";

// Tipos
type Role = "ADMIN" | "EMPLOYEE";
type UserRow = {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
};

const COLORS = {
  bgCard: "#14163A",
  border: "#1E1F4B",
  input: "#0F1030",
  cyan: "#00FFFF",
  pink: "#FF00FF",
  text: "#E5E5E5",
};

export default function UsersPage() {
  const router = useRouter();
  const { role, token, ready } = useAuth();

  // Guard: solo ADMIN
  useEffect(() => {
    if (!ready) return;
    if (role !== "ADMIN") router.replace("/pos");
  }, [ready, role, router]);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Form crear / editar
  const [editId, setEditId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); // para crear o reset
  const [newRole, setNewRole] = useState<Role>("EMPLOYEE");
  const isEdit = useMemo(() => editId !== null, [editId]);

  // Siempre un Record<string,string>; si hay token se agrega Authorization
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/users", { headers: authHeaders });
      const data: UserRow[] = await r.json();
      setRows(data);
    } catch {
      setMsg("No se pudieron cargar los usuarios");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || role !== "ADMIN") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  const resetForm = () => {
    setEditId(null);
    setUsername("");
    setPassword("");
    setNewRole("EMPLOYEE");
  };

  const onCreate = async () => {
    if (!username.trim() || password.length < 6) {
      setMsg("Usuario y contraseña (min. 6) son requeridos");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const payload = { username: username.trim(), password, role: newRole };
    const r = await apiFetch("/users", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setMsg("Usuario creado ✅");
      resetForm();
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo crear"));
    }
    setTimeout(() => setMsg(""), 2500);
  };

  const onEditStart = (u: UserRow) => {
    setEditId(u.id);
    setUsername(u.username);
    setNewRole(u.role);
    setPassword(""); // si se llena, resetea
  };

  const onUpdate = async () => {
    if (!editId) return;
    if (!username.trim()) {
      setMsg("El usuario es requerido");
      setTimeout(() => setMsg(""), 2200);
      return;
    }
    const payload: { username: string; role: Role; password?: string } = {
      username: username.trim(),
      role: newRole,
    };
    if (password.trim().length >= 6) payload.password = password.trim();

    const r = await apiFetch(`/users/${editId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      setMsg("Usuario actualizado ✅");
      resetForm();
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo actualizar"));
    }
    setTimeout(() => setMsg(""), 2500);
  };

  const onDelete = async (id: number) => {
    if (!confirm("¿Eliminar este usuario? Esta acción es permanente.")) return;
    const r = await apiFetch(`/users/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (r.ok) {
      setMsg("Usuario eliminado ✅");
      if (id === editId) resetForm();
      load();
    } else {
      const e = await r.json().catch(() => ({}));
      setMsg("Error: " + (e?.error || "No se pudo eliminar"));
    }
    setTimeout(() => setMsg(""), 2500);
  };

  // Evitar parpadeo mientras valida rol
  if (!ready || role !== "ADMIN") {
    return <div className="p-6 text-gray-300">Cargando…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto text-gray-200 space-y-6">
      <h1 className="text-2xl font-bold text-cyan-400">Usuarios</h1>

      {/* Formulario Crear / Editar */}
      <section
        className="rounded-xl p-4"
        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
      >
        <h2 className="text-lg font-semibold mb-3 text-cyan-300">
          {isEdit ? `Editar usuario #${editId}` : "Nuevo usuario"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">Usuario *</label>
            <input
              className="rounded px-3 py-2 w-full text-gray-100 outline-none"
              style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
              placeholder="Ej: juan.perez"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              {isEdit ? "Resetear contraseña" : "Contraseña *"}
            </label>
            <input
              className="rounded px-3 py-2 w-full text-gray-100 outline-none"
              style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
              type="password"
              placeholder={isEdit ? "(opcional, min 6)" : "mínimo 6 caracteres"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Rol</label>
            <select
              className="rounded px-3 py-2 w-full text-gray-100 outline-none"
              style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          {isEdit ? (
            <>
              <button
                onClick={onUpdate}
                className="px-5 py-2.5 rounded-lg font-semibold"
                style={{
                  color: "#001014",
                  background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                  boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
                }}
              >
                Actualizar
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded border"
                style={{ borderColor: COLORS.border }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={onCreate}
              className="px-5 py-2.5 rounded-lg font-semibold"
              style={{
                color: "#001014",
                background: "linear-gradient(90deg, rgba(0,255,255,0.9), rgba(255,0,255,0.9))",
                boxShadow: "0 0 18px rgba(0,255,255,.25), 0 0 28px rgba(255,0,255,.25)",
              }}
            >
              Crear
            </button>
          )}
        </div>

        {!!msg && <div className="text-sm mt-3 text-cyan-300">{msg}</div>}
      </section>

      {/* Lista de usuarios */}
      <section
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: COLORS.bgCard, border: `1px solid ${COLORS.border}` }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left bg-[#1E1F4B]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th className="py-2 px-3 text-cyan-300 text-sm uppercase">ID</th>
                <th className="px-3 text-cyan-300 text-sm uppercase">Usuario</th>
                <th className="px-3 text-cyan-300 text-sm uppercase">Rol</th>
                <th className="px-3 text-cyan-300 text-sm uppercase">Creado</th>
                <th className="px-3 text-cyan-300 text-sm uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="py-3 px-3 text-gray-400" colSpan={5}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className="py-3 px-3 text-gray-400" colSpan={5}>
                    Sin usuarios
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-[#191B4B]" style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td className="py-2 px-3">{u.id}</td>
                  <td className="px-3">{u.username}</td>
                  <td className="px-3">
                    <span
                      className="px-2 py-0.5 rounded text-xs"
                      style={{ backgroundColor: COLORS.input, border: `1px solid ${COLORS.border}` }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3">{new Date(u.createdAt).toLocaleString("es-CO")}</td>
                  <td className="px-3 text-right space-x-2">
                    <button
                      onClick={() => onEditStart(u)}
                      className="underline text-cyan-300"
                      title="Editar usuario / cambiar rol / resetear clave"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(u.id)}
                      className="underline text-pink-400"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}