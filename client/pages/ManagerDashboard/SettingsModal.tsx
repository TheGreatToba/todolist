import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "./useModalA11y";
import type { User } from "@shared/api";
import { AccountSettingsForm } from "@/components/AccountSettingsForm";
import {
  loadExceptionAlertsSettings,
  saveExceptionAlertsSettings,
  type ExceptionAlertsSettings,
} from "@/lib/exception-alerts";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  modalRef: React.RefObject<HTMLDivElement | null>;
  teamId?: string | null;
  user?: User | null;
}

export function SettingsModal({
  isOpen,
  onClose,
  teamName,
  modalRef,
  teamId,
  user,
}: SettingsModalProps) {
  useModalA11y(modalRef, isOpen, onClose);

  const [alertSettings, setAlertSettings] = useState<ExceptionAlertsSettings>(
    () => loadExceptionAlertsSettings(teamId ?? user?.teamId ?? null),
  );

  useEffect(() => {
    setAlertSettings((current) => ({
      ...current,
      ...loadExceptionAlertsSettings(teamId ?? user?.teamId ?? null),
    }));
  }, [teamId, user?.teamId]);

  const handleUpdateAlertSettings = (
    updater: (prev: ExceptionAlertsSettings) => ExceptionAlertsSettings,
  ) => {
    setAlertSettings((prev) => {
      const next = updater(prev);
      saveExceptionAlertsSettings(teamId ?? user?.teamId ?? null, next);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="bg-card rounded-xl shadow-lg max-w-md w-full p-6 border border-border max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Team settings"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="settings-modal-title"
            className="text-xl font-bold text-foreground"
          >
            Paramètres de l&apos;équipe
            <span className="sr-only">Team settings</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition"
            aria-label="Close settings modal"
            type="button"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-secondary/30 border border-border rounded-lg p-4">
            <p className="text-sm font-medium text-foreground mb-1">Équipe</p>
            <p className="text-sm text-muted-foreground">{teamName}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Mon compte</p>
            <AccountSettingsForm user={user} />
          </div>

          <div className="space-y-3 border border-border rounded-lg p-4 bg-secondary/20">
            <div>
              <p className="text-sm font-medium text-foreground">
                Alertes d&apos;exception
              </p>
              <p className="text-xs text-muted-foreground">
                Configurez quand des alertes réservées au manager sont levées
                pour les tâches en retard, critiques ou non assignées. Les
                alertes s&apos;affichent uniquement lorsque les seuils sont
                dépassés.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Tâches en retard
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Déclencher une alerte lorsque le nombre de tâches en retard
                    atteint au moins cette valeur.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                    checked={alertSettings.enabled.overdue}
                    onChange={(e) =>
                      handleUpdateAlertSettings((prev) => ({
                        ...prev,
                        enabled: { ...prev.enabled, overdue: e.target.checked },
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">Activé</span>
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                  value={alertSettings.overdueCountThreshold}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const value = Number.isFinite(raw) && raw >= 1 ? raw : 1;
                    handleUpdateAlertSettings((prev) => ({
                      ...prev,
                      overdueCountThreshold: value,
                    }));
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Tâches critiques non démarrées
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Déclencher une alerte lorsque au moins ce nombre de tâches
                    critiques du jour ne sont pas terminées.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                    checked={alertSettings.enabled.criticalNotStarted}
                    onChange={(e) =>
                      handleUpdateAlertSettings((prev) => ({
                        ...prev,
                        enabled: {
                          ...prev.enabled,
                          criticalNotStarted: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">Activé</span>
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                  value={alertSettings.criticalNotStartedCountThreshold}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const value = Number.isFinite(raw) && raw >= 1 ? raw : 1;
                    handleUpdateAlertSettings((prev) => ({
                      ...prev,
                      criticalNotStartedCountThreshold: value,
                    }));
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Tâches non assignées
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Déclencher une alerte lorsque le nombre de tâches non
                    assignées pour aujourd&apos;hui atteint au moins cette
                    valeur.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                    checked={alertSettings.enabled.unassigned}
                    onChange={(e) =>
                      handleUpdateAlertSettings((prev) => ({
                        ...prev,
                        enabled: {
                          ...prev.enabled,
                          unassigned: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">Activé</span>
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground"
                  value={alertSettings.unassignedCountThreshold}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const value = Number.isFinite(raw) && raw >= 1 ? raw : 1;
                    handleUpdateAlertSettings((prev) => ({
                      ...prev,
                      unassignedCountThreshold: value,
                    }));
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-4 py-2 border border-input text-foreground rounded-lg hover:bg-secondary transition text-sm font-medium"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
