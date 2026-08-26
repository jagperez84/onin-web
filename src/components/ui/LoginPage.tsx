import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

export function LoginPage() {
  const { user, configured, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user)
    return (
      <Navigate
        to={(location.state as { from?: string } | null)?.from ?? "/"}
        replace
      />
    );

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
    navigate((location.state as { from?: string } | null)?.from ?? "/", {
      replace: true,
    });
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand">ONIN</div>
        <div className="auth-eyebrow">ACCESO</div>
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="auth-subtitle">Accede a la aplicación de gestión.</p>
        {!configured && (
          <div className="auth-warning">
            Supabase no está configurado. Copia <code>.env.example</code> a{" "}
            <code>.env</code> e informa la URL y la clave pública del proyecto.
          </div>
        )}
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              placeholder="nombre@empresa.com"
            />
          </label>
          <label>
            Contraseña
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Tu contraseña"
              />
              <button
                type="button"
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <button className="auth-submit" disabled={busy || !configured}>
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
