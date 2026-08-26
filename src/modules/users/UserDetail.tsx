import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Save, UserCog } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getUserById,
  updateUserAccount,
  type UserAccount,
  type UserRole,
} from "../../services/core/userRepository";
import { MessageLog } from "../../components/ui/MessageLog";
import { useAuth } from "../../auth/AuthContext";
import "./users.css";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  OFFICE: "Oficina",
  WORKSHOP: "Taller",
  CONFECTION: "Confección",
  INSTALLER: "Montador",
};

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<UserAccount | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    role_code: "OFFICE" as UserRole,
    can_measure: false,
    active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const u = await getUserById(Number(id));
      setRow(u);
      setForm({
        display_name: u.display_name,
        email: u.email,
        role_code: u.role_code,
        can_measure: u.can_measure,
        active: u.active,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el usuario.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    setError("");
    try {
      await updateUserAccount(row.id, form);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el usuario.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <div className="loading-block">Cargando usuario…</div>;
  if (!row)
    return (
      <div className="module-page">
        <MessageLog error={error || "Usuario no encontrado."} />
      </div>
    );
  const isCurrent = row.auth_user_id === user?.id;
  return (
    <div className="module-page users-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            CONFIGURACIÓN / USUARIOS / {row.username}
          </div>
          <h1>{row.display_name}</h1>
          <p>
            {row.username} · {roleLabels[row.role_code]}
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => navigate("/configuracion/usuarios")}
        >
          <ArrowLeft size={15} /> Volver
        </button>
      </div>
      <MessageLog error={error} />
      <form className="panel user-detail-panel" onSubmit={save}>
        <div className="panel-head">
          <div>
            <h2>Datos del usuario</h2>
            <p>Gestiona el perfil y las capacidades operativas.</p>
          </div>
          <UserCog size={19} />
        </div>
        <div className="form-grid">
          <label>
            Usuario
            <input value={row.username} readOnly />
          </label>
          <label>
            Nombre
            <input
              value={form.display_name}
              onChange={(e) =>
                setForm({ ...form, display_name: e.target.value })
              }
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Rol
            <select
              value={form.role_code}
              onChange={(e) =>
                setForm({ ...form, role_code: e.target.value as UserRole })
              }
            >
              {Object.entries(roleLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <span>Puede realizar mediciones</span>
            <input
              type="checkbox"
              checked={form.can_measure}
              onChange={(e) =>
                setForm({ ...form, can_measure: e.target.checked })
              }
            />
          </label>
          <label className="checkbox-field">
            <span>Usuario activo</span>
            <input
              type="checkbox"
              checked={form.active}
              disabled={isCurrent}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
          </label>
        </div>
        {isCurrent && (
          <p className="secondary">
            Tu usuario no puede desactivarse desde su propia sesión.
          </p>
        )}
        <div className="form-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/configuracion/usuarios")}
          >
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Save size={15} />
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}
