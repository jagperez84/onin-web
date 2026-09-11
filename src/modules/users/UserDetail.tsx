import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, Check, Copy, KeyRound, Save, ShieldCheck, UserCog, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getUserById,
  updateUserAccount,
  listUserCompanyIds,
  setUserCompanies,
  listUserPermissions,
  setUserPermissions,
  regenerateCredentials,
  type UserAccount,
  type UserRole,
} from "../../services/core/userRepository";
import { MessageLog } from "../../components/ui/MessageLog";
import { useAuth } from "../../auth/AuthContext";
import { navSections } from "../../app/routes";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import "./users.css";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  OFFICE: "Oficina",
  WORKSHOP: "Taller",
  CONFECTION: "Confección",
  INSTALLER: "Montador",
};

const permissionSections = navSections
  .map((section) => ({
    label: section.label,
    items: section.items.filter((item) => item.to !== "/configuracion/usuarios"),
  }))
  .filter((section) => section.items.length > 0);

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, listCompanies } = useAuth();
  const [row, setRow] = useState<UserAccount | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    role_code: "OFFICE" as UserRole,
    can_measure: false,
    active: true,
  });
  const [companies, setCompanies] = useState<{ id: number; name: string; code: string }[]>([]);
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [permittedRoutes, setPermittedRoutes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [u, myCompanies] = await Promise.all([
        getUserById(Number(id)),
        listCompanies(),
      ]);
      setRow(u);
      setForm({
        display_name: u.display_name,
        email: u.email,
        role_code: u.role_code,
        can_measure: u.can_measure,
        active: u.active,
      });
      setCompanies(myCompanies.map((c) => ({ id: c.id, name: c.name, code: c.code })));
      const [ids, routes] = await Promise.all([
        listUserCompanyIds(u.id),
        listUserPermissions(u.id),
      ]);
      setCompanyIds(ids);
      setPermittedRoutes(routes);
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
    if (companyIds.length === 0) {
      setError("El usuario debe pertenecer al menos a una empresa.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateUserAccount(row.id, form);
      await setUserCompanies(row.id, companyIds);
      if (form.role_code !== "ADMIN") {
        await setUserPermissions(row.id, permittedRoutes);
      }
      setSuccess("Cambios guardados correctamente.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  function toggleCompany(companyId: number) {
    setCompanyIds((ids) =>
      ids.includes(companyId) ? ids.filter((x) => x !== companyId) : [...ids, companyId],
    );
  }

  function toggleRoute(to: string) {
    setPermittedRoutes((routes) =>
      routes.includes(to) ? routes.filter((x) => x !== to) : [...routes, to],
    );
  }

  function toggleSection(items: { to: string }[]) {
    const allOn = items.every((i) => permittedRoutes.includes(i.to));
    setPermittedRoutes((routes) =>
      allOn
        ? routes.filter((r) => !items.some((i) => i.to === r))
        : [...new Set([...routes, ...items.map((i) => i.to)])],
    );
  }

  async function handleRegenerate() {
    if (!row) return;
    const ok = await confirmDialog({
      title: "Regenerar credenciales",
      message: `Se generará una contraseña nueva para ${row.display_name}. La contraseña actual dejará de funcionar.`,
      danger: true,
      confirmLabel: "Regenerar",
    });
    if (!ok) return;
    setRegenerating(true);
    setError("");
    try {
      const password = await regenerateCredentials(row.id);
      setNewPassword(password);
      setCopied(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron regenerar las credenciales.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  function copyPassword() {
    if (!newPassword) return;
    void navigator.clipboard.writeText(newPassword).then(() => setCopied(true));
  }

  if (loading) return <div className="loading-block">Cargando usuario…</div>;
  if (!row)
    return (
      <div className="module-page">
        <MessageLog error={error || "Usuario no encontrado."} />
      </div>
    );
  const isCurrent = row.auth_user_id === user?.id;
  const isAdminRole = form.role_code === "ADMIN";

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
      <MessageLog error={error} success={success} />
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

        <div className="panel-head user-section-head">
          <div>
            <h2>Empresas asignadas</h2>
            <p>Empresas a las que este usuario puede acceder y cambiar.</p>
          </div>
          <Building2 size={19} />
        </div>
        <div className="user-company-grid">
          {companies.map((c) => (
            <label key={c.id} className="checkbox-field user-company-option">
              <span>
                <strong>{c.code}</strong> · {c.name}
              </span>
              <input
                type="checkbox"
                checked={companyIds.includes(c.id)}
                onChange={() => toggleCompany(c.id)}
              />
            </label>
          ))}
        </div>

        <div className="panel-head user-section-head">
          <div>
            <h2>Permisos por módulo</h2>
            <p>
              {isAdminRole
                ? "Los administradores tienen acceso completo a todos los módulos."
                : "Marca los módulos y pantallas a los que este usuario puede acceder."}
            </p>
          </div>
          <ShieldCheck size={19} />
        </div>
        {!isAdminRole && (
          <div className="user-permission-groups">
            {permissionSections.map((section) => {
              const allOn = section.items.every((i) =>
                permittedRoutes.includes(i.to),
              );
              return (
                <div key={section.label} className="user-permission-group">
                  <label className="checkbox-field user-permission-group-head">
                    <span>{section.label}</span>
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() => toggleSection(section.items)}
                    />
                  </label>
                  <div className="user-permission-items">
                    {section.items.map((item) => (
                      <label key={item.to} className="checkbox-field">
                        <span>{item.label}</span>
                        <input
                          type="checkbox"
                          checked={permittedRoutes.includes(item.to)}
                          onChange={() => toggleRoute(item.to)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="form-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleRegenerate()}
            disabled={isCurrent || regenerating}
            title={
              isCurrent
                ? "No puedes regenerar tus propias credenciales desde tu sesión."
                : "Genera una contraseña temporal nueva"
            }
          >
            <KeyRound size={15} />
            {regenerating ? "Generando…" : "Regenerar credenciales"}
          </button>
          <div className="page-actions">
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
        </div>
      </form>

      {newPassword && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNewPassword(null);
          }}
        >
          <div className="modal-card sm" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title-wrap">
                <div className="modal-icon-badge success">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3>Credenciales regeneradas</h3>
                  <p>Copia esta contraseña ahora; no volverá a mostrarse.</p>
                </div>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setNewPassword(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="user-new-password">
                <code>{newPassword}</code>
                <button type="button" className="icon-action" onClick={copyPassword} title="Copiar">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <p className="secondary">
                Entrégasela al usuario por un canal seguro. Podrá cambiarla tras iniciar sesión.
              </p>
            </div>
            <div className="modal-actions-footer">
              <button
                type="button"
                className="primary-button"
                onClick={() => setNewPassword(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
