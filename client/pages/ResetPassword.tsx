import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useResetPasswordMutation, queryKeys } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetPasswordMutation = useResetPasswordMutation({
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.profile, { user: data.user });
      window.location.href =
        data.user.role === "MANAGER" ? "/manager/dashboard" : "/employee";
    },
    onError: (err) => {
      setError(
        err.message ??
          "Échec de la réinitialisation du mot de passe. Merci de réessayer.",
      );
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(
        "Lien invalide. Merci d'utiliser le lien reçu dans l'e-mail de réinitialisation de mot de passe.",
      );
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    resetPasswordMutation.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/15 mb-4">
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Lien invalide
          </h1>
          <p className="text-muted-foreground mb-6">
            Merci d&apos;utiliser le lien reçu dans votre e-mail de
            réinitialisation de mot de passe. Le lien a peut-être expiré.
          </p>
          <button
            onClick={() => navigate("/forgot-password")}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
          >
            Demander un nouveau lien
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Réinitialisez votre mot de passe
          </h1>
          <p className="text-muted-foreground">
            Saisissez votre nouveau mot de passe ci-dessous
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 bg-card rounded-2xl shadow-sm border border-border p-8"
        >
          {error && (
            <div
              role="alert"
              aria-label={error}
              className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Nouveau mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Au moins 6 caractères
            </p>
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
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={resetPasswordMutation.isPending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {resetPasswordMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Réinitialisation du mot de passe...
              </>
            ) : (
              "Réinitialiser et se connecter"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
