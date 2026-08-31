import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import type { CompanyOption } from "../../services/core/companyRepository";
import { ThemeToggle } from "./ThemeToggle";

export function LoginPage() {
  const { user, configured, signIn, listCompanies, switchCompany } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!user) {
      setCompanies(null);
      setSelectedCompanyId(null);
      return;
    }
    let active = true;
    void listCompanies()
      .then((rows) => {
        if (!active) return;
        setCompanies(rows);
        const current = rows.find((company) => company.is_current) ?? rows[0];
        setSelectedCompanyId(current?.id ?? null);
      })
      .catch((err) => {
        if (!active) return;
        setCompanies([]);
        setError(err instanceof Error ? err.message : "No se pudieron cargar las empresas.");
      });
    return () => {
      active = false;
    };
  }, [user, listCompanies]);

  if (user && companies && companies.length <= 1)
    return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Introduce email y contraseña.");
      return;
    }
    setBusy(true);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
  }

  async function enterCompany() {
    if (selectedCompanyId === null) {
      setError("Selecciona una empresa.");
      return;
    }
    setError("");
    setSwitching(true);
    try {
      const current = companies?.find((company) => company.is_current);
      if (current?.id !== selectedCompanyId) await switchCompany(selectedCompanyId);
      window.location.assign(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar de empresa.");
      setSwitching(false);
    }
  }

  return (
    <main className="auth-page">
      <ThemeToggle />
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand">ONIN</div>
        <div className="auth-eyebrow">{user ? "EMPRESA" : "ACCESO"}</div>
        <h1 id="login-title">{user ? "Selecciona empresa" : "Iniciar sesión"}</h1>
        <p className="auth-subtitle">
          {user ? "Elige la empresa con la que quieres trabajar." : "Accede a la aplicación de gestión."}
        </p>
        {!configured && (
          <div className="auth-warning">
            Supabase no está configurado. Copia <code>.env.example</code> a <code>.env</code> e informa la URL y la clave pública del proyecto.
          </div>
        )}
        {error && <div className="auth-error" role="alert">{error}</div>}

        {user ? (
          <div className="auth-form">
            <label>
              Empresa
              <select
                value={selectedCompanyId ?? ""}
                onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                disabled={switching || !companies}
              >
                <option value="" disabled>Selecciona una empresa</option>
                {(companies ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} · {company.code}
                  </option>
                ))}
              </select>
            </label>
            <button className="auth-submit" type="button" onClick={() => void enterCompany()} disabled={switching || selectedCompanyId === null}>
              {switching ? "Cambiando..." : "Entrar en la empresa"}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="nombre@empresa.com" />
            </label>
            <label>
              Contraseña
              <div className="password-field">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Tu contraseña" />
                <button type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <button className="auth-submit" disabled={busy || !configured}>
              {busy ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
