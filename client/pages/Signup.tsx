import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function Signup() {
  const navigate = useNavigate();
  const { signup, user, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  // Redirect after successful signup
  React.useEffect(() => {
    if (user) {
      if (user.role === "MANAGER") {
        navigate("/manager/today", { replace: true });
      } else if (user.role === "EMPLOYEE") {
        navigate("/employee", { replace: true });
      }
    }
  }, [user, navigate]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (
      !formData.name ||
      !formData.email ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      setLocalError("Merci de renseigner tous les champs");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setLocalError("Les mots de passe ne correspondent pas");
      return;
    }

    if (formData.password.length < 6) {
      setLocalError("Le mot de passe doit comporter au moins 6 caractères");
      return;
    }

    try {
      await signup(formData.name, formData.email, formData.password);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : "Échec de la création du compte. Merci de réessayer.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4 selection:bg-primary/30">
      <div className="absolute inset-0 pointer-events-none mesh-gradient-bg opacity-40 z-0"></div>

      <div className="relative z-10 w-full max-w-md animate-fade-in-up my-8">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Tasty Crousty"
            className="h-20 w-auto object-contain mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Créer un compte
          </h1>
          <p className="text-muted-foreground">
            Rejoignez Tasty Crousty et gérez vos tâches
          </p>
        </div>

        {/* Form */}
        <div className="relative">
          <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-primary via-accent to-primary opacity-20 blur-xl animate-pulse-glow pointer-events-none"></div>
          <form
            onSubmit={handleSubmit}
            className="relative glass-card space-y-5 rounded-3xl shadow-2xl border border-border/50 p-8 md:p-10"
          >
            {(error || localError) && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
                {error || localError}
              </div>
            )}

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Nom complet
              </label>
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Jean Dupont"
                className="w-full px-4 py-3 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground mb-2"
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="vous@example.com"
                className="w-full px-4 py-3 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Confirmer le mot de passe
              </label>
              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner"
              />
            </div>

            <div className="bg-secondary/40 border border-border/50 rounded-xl p-4 shadow-inner">
              <p className="text-foreground font-semibold text-sm drop-shadow-sm">Compte manager uniquement</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Seuls les managers peuvent créer un compte ici. Les comptes
                employés sont créés par leur manager depuis le tableau de bord.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création du compte...
                </>
              ) : (
                "Créer un compte"
              )}
            </button>

            <div className="text-center text-sm text-muted-foreground">
              Vous avez déjà un compte ?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-primary hover:text-primary/90 font-medium transition"
              >
                Se connecter
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
