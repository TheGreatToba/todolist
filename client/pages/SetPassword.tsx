import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Lock } from "lucide-react";
import { z } from "zod";

const SetPasswordResponseSchema = z.object({
  success: z.boolean(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(["EMPLOYEE", "MANAGER"]),
    teamId: z.string().nullable().optional(),
  }),
});

const ErrorResponseSchema = z.object({
  error: z.string().optional(),
});

export default function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user && success) {
      navigate(user.role === "MANAGER" ? "/manager" : "/employee", {
        replace: true,
      });
    }
  }, [user, success, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Invalid link. Please use the link from your welcome email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });

      const raw = await response.json();

      if (response.ok) {
        const data = SetPasswordResponseSchema.parse(raw);
        setSuccess(true);
        // AuthContext will get user from /api/auth/profile on next request,
        // but we need to trigger a refresh. The cookie is set, so we can
        // call login with a dummy to trigger profile fetch, or we could
        // add a refresh method. Simpler: just navigate and let the app
        // re-fetch profile. Actually the set-password response returns user,
        // but AuthContext doesn't have a way to set user from outside.
        // We need to either: 1) add setUser to AuthContext, or 2) force
        // window.location.href to /employee to trigger full reload and
        // profile fetch. Option 2 is simpler for now.
        window.location.href =
          data.user.role === "MANAGER" ? "/manager" : "/employee";
      } else {
        const data = ErrorResponseSchema.parse(raw);
        setError(data.error ?? "Failed to set password");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/15 mb-4">
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Invalid link
          </h1>
          <p className="text-muted-foreground mb-6">
            Please use the link from your welcome email to set your password.
            The link may have expired.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
          >
            Go to sign in
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
            Set your password
          </h1>
          <p className="text-muted-foreground">
            Create a secure password for your TaskFlow account
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 bg-card rounded-2xl shadow-sm border border-border p-8"
        >
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground mb-2"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
            <p className="text-xs text-muted-foreground mt-1">
              At least 6 characters
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting password...
              </>
            ) : (
              "Set password & sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
