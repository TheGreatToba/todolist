import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForgotPasswordMutation } from "@/hooks/queries";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [expiryHours, setExpiryHours] = useState(1);

  const forgotPasswordMutation = useForgotPasswordMutation({
    onSuccess: (data) => {
      setExpiryHours(data.expiryHours);
      setSuccess(true);
      setError(null);
    },
    onError: (err) => {
      setError(
        err.message ?? "Échec de l'envoi de l'e-mail de réinitialisation.",
      );
      setSuccess(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email) {
      setError("Merci de saisir votre adresse e-mail");
      return;
    }

    forgotPasswordMutation.mutate({ email });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 mb-4">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Consultez votre boîte mail
            </h1>
            <p className="text-muted-foreground">
              Si un compte existe avec cet e-mail, un lien de réinitialisation
              de mot de passe vous a été envoyé.
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-border p-8 space-y-6">
            <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 text-sm text-foreground">
              <p className="mb-2">
                Nous avons envoyé un lien de réinitialisation de mot de passe à{" "}
                <strong>{email}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Le lien expirera dans {expiryHours} heure
                {expiryHours === 1 ? "" : "s"}. Si vous ne voyez pas l'e-mail,
                vérifiez vos courriers indésirables.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate("/login")}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition"
              >
                Retour à la connexion
              </button>
              <button
                onClick={() => {
                  setSuccess(false);
                  setEmail("");
                }}
                className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-3 rounded-lg transition"
              >
                Envoyer un autre e-mail
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 mb-4">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Mot de passe oublié ?
          </h1>
          <p className="text-muted-foreground">
            Saisissez votre adresse e-mail et nous vous enverrons un lien pour
            réinitialiser votre mot de passe.
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
              htmlFor="email"
              className="block text-sm font-medium text-foreground mb-2"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@example.com"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={forgotPasswordMutation.isPending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {forgotPasswordMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              "Envoyer le lien"
            )}
          </button>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à la connexion
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
