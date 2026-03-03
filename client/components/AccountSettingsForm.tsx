import React, { useEffect, useState } from "react";
import type { User } from "@shared/api";
import { useUpdateProfileMutation } from "@/hooks/queries";
import { getErrorMessage } from "@/lib/get-error-message";
import { toastError, toastSuccess } from "@/lib/toast";

interface AccountSettingsFormProps {
  user: User | null;
  onSaved?: () => void;
}

export function AccountSettingsForm({
  user,
  onSaved,
}: AccountSettingsFormProps) {
  const updateProfile = useUpdateProfileMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.name, user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (password && password !== confirmPassword) {
      toastError("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    const payload: { name?: string; email?: string; password?: string } = {};
    if (name.trim() && name.trim() !== user.name) payload.name = name.trim();
    if (email.trim() && email.trim() !== user.email)
      payload.email = email.trim();
    if (password) payload.password = password;

    if (Object.keys(payload).length === 0) {
      toastSuccess("Aucune modification à enregistrer.");
      return;
    }

    try {
      await updateProfile.mutateAsync(payload);
      setPassword("");
      setConfirmPassword("");
      toastSuccess("Profil mis à jour avec succès.");
      onSaved?.();
    } catch (error) {
      toastError(getErrorMessage(error, "Échec de la mise à jour du profil."));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Nom
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          E-mail
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Nouveau mot de passe
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Laisser vide pour conserver le mot de passe actuel"
          className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Confirmer le mot de passe
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={updateProfile.isPending}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition text-sm disabled:opacity-50"
        >
          Enregistrer le compte
        </button>
      </div>
    </form>
  );
}
