import React from "react";
import { Edit2, Trash2, Mail } from "lucide-react";
import type { WorkstationWithEmployees } from "@/hooks/queries";
import type { TeamMember } from "./types";

interface EmployeesTabProps {
  teamMembers: TeamMember[];
  workstations: WorkstationWithEmployees[];
  newEmployee: {
    name: string;
    email: string;
    workstationIds: string[];
  };
  onNewEmployeeChange: (next: {
    name: string;
    email: string;
    workstationIds: string[];
  }) => void;
  onSubmitCreate: (e: React.FormEvent) => void;
  editingEmployee: string | null;
  editingWorkstations: string[];
  setEditingEmployee: (id: string | null) => void;
  setEditingWorkstations: (ids: string[]) => void;
  onSaveWorkstations: (employeeId: string) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onResendWelcomeEmail: (employeeId: string) => void;
}

export function EmployeesTab({
  teamMembers,
  workstations,
  newEmployee,
  onNewEmployeeChange,
  onSubmitCreate,
  editingEmployee,
  editingWorkstations,
  setEditingEmployee,
  setEditingWorkstations,
  onSaveWorkstations,
  onDeleteEmployee,
  onResendWelcomeEmail,
}: EmployeesTabProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground mb-4">
          Créer un nouvel employé
        </h2>

        <form
          onSubmit={onSubmitCreate}
          className="bg-card rounded-xl border border-border p-6 shadow-sm mb-8 space-y-4"
        >
          <p className="text-sm text-muted-foreground -mt-2">
            L&apos;employé recevra un e-mail avec un lien sécurisé pour définir
            son mot de passe (aucun mot de passe n&apos;est envoyé par e-mail).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="employee-name"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Nom complet
              </label>
              <input
                id="employee-name"
                type="text"
                required
                value={newEmployee.name}
                onChange={(e) =>
                  onNewEmployeeChange({ ...newEmployee, name: e.target.value })
                }
                placeholder="Jean Dupont"
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label
                htmlFor="employee-email"
                className="block text-sm font-medium text-foreground mb-2"
              >
                E-mail
              </label>
              <input
                id="employee-email"
                type="email"
                required
                value={newEmployee.email}
                onChange={(e) =>
                  onNewEmployeeChange({
                    ...newEmployee,
                    email: e.target.value,
                  })
                }
                placeholder="jean@example.com"
                className="w-full px-4 py-2 rounded-lg border border-input bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Postes (sélectionnez-en un ou plusieurs)
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-input rounded-lg p-3 bg-background">
                {workstations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun poste disponible. Créez-en un dans l&apos;onglet
                    Postes d&apos;abord.
                  </p>
                ) : (
                  workstations.map((ws) => (
                    <label
                      key={ws.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={newEmployee.workstationIds.includes(ws.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onNewEmployeeChange({
                              ...newEmployee,
                              workstationIds: [
                                ...newEmployee.workstationIds,
                                ws.id,
                              ],
                            });
                          } else {
                            onNewEmployeeChange({
                              ...newEmployee,
                              workstationIds: newEmployee.workstationIds.filter(
                                (id) => id !== ws.id,
                              ),
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-input"
                      />
                      <span className="text-sm text-foreground">{ws.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
          >
            Créer l&apos;employé
          </button>
        </form>
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-4">
        Membres de l&apos;équipe ({teamMembers.length})
      </h3>
      <div className="space-y-3">
        {teamMembers.length === 0 ? (
          <div className="text-center py-8 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">
              Aucun employé pour l&apos;instant. Créez-en un ci-dessus !
            </p>
          </div>
        ) : (
          teamMembers.map((member) => (
            <div
              key={member.id}
              className={`bg-card rounded-lg border transition ${
                editingEmployee === member.id
                  ? "border-primary"
                  : "border-border"
              } p-4`}
            >
              {editingEmployee === member.id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-input rounded-lg p-3 bg-background">
                    {workstations.map((ws) => (
                      <label
                        key={ws.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editingWorkstations.includes(ws.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditingWorkstations([
                                ...editingWorkstations,
                                ws.id,
                              ]);
                            } else {
                              setEditingWorkstations(
                                editingWorkstations.filter(
                                  (id) => id !== ws.id,
                                ),
                              );
                            }
                          }}
                          className="w-4 h-4 rounded border-input"
                        />
                        <span className="text-sm text-foreground">
                          {ws.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => onSaveWorkstations(member.id)}
                      className="flex-1 min-w-0 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition text-sm"
                      type="button"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => {
                        setEditingEmployee(null);
                        setEditingWorkstations([]);
                      }}
                      className="flex-1 min-w-0 px-3 py-2 border border-input text-foreground hover:bg-secondary rounded-lg transition text-sm"
                      type="button"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => onDeleteEmployee(member.id)}
                      className="px-3 py-2 text-destructive hover:bg-destructive/10 rounded-lg transition text-sm border border-destructive/30"
                      type="button"
                    >
                      Supprimer l&apos;employé
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                    </p>
                    {member.workstations.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-2">
                        {member.workstations.map((ws) => (
                          <span
                            key={ws.id}
                            className="inline-block px-2 py-1 bg-primary/15 text-primary text-xs rounded-full"
                          >
                            {ws.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onResendWelcomeEmail(member.id)}
                      className="p-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg transition"
                      title="Renvoyer l'e-mail de bienvenue"
                      type="button"
                      aria-label={`Renvoyer l'e-mail de bienvenue à ${member.name}`}
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingEmployee(member.id);
                        setEditingWorkstations(
                          member.workstations.map((ws) => ws.id),
                        );
                      }}
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition"
                      title="Modifier les postes"
                      type="button"
                      aria-label={`Modifier les postes de ${member.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteEmployee(member.id)}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition"
                      title="Supprimer l'employé"
                      type="button"
                      aria-label={`Supprimer ${member.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
