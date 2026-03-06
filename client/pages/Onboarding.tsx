import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, X, Loader2 } from "lucide-react";
import { fetchWithCsrf } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type Workstation = { id: string; name: string };
type Employee = { id: string; name: string; email: string };
type Task = { title: string; workstationId: string };

const STEPS = [
  { label: "Restaurant" },
  { label: "Postes" },
  { label: "Employés" },
  { label: "Tâches" },
  { label: "Terminé" },
];

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 w-full overflow-x-auto">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center min-w-[56px]">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300",
                  done
                    ? "bg-green-500 border-green-500 text-white"
                    : active
                      ? "bg-primary border-primary text-primary-foreground shadow-[0_0_12px_rgba(233,30,99,0.4)]"
                      : "bg-muted/40 border-border text-muted-foreground",
                ].join(" ")}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={[
                  "text-[10px] mt-1 font-medium hidden sm:block",
                  active
                    ? "text-primary"
                    : done
                      ? "text-green-500"
                      : "text-muted-foreground",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "h-0.5 flex-1 mx-1 transition-all duration-300",
                  i < current ? "bg-green-500" : "bg-border",
                ].join(" ")}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [teamName, setTeamName] = useState("");

  // Step 2 state
  const [workstationInput, setWorkstationInput] = useState("");
  const [createdWorkstations, setCreatedWorkstations] = useState<Workstation[]>(
    [],
  );

  // Step 3 state
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [addedEmployees, setAddedEmployees] = useState<Employee[]>([]);

  // Step 4 state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskWorkstationId, setTaskWorkstationId] = useState("");
  const [addedTasks, setAddedTasks] = useState<Task[]>([]);

  // Counts for step 5
  const [summary, setSummary] = useState({
    workstations: 0,
    employees: 0,
    tasks: 0,
  });

  async function handleStep1Next() {
    if (!teamName.trim()) {
      setError("Le nom du restaurant est requis");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const teamId = user?.teamId;
      if (!teamId) {
        throw new Error("Team introuvable");
      }
      const res = await fetchWithCsrf(`/api/team/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Erreur lors de la mise à jour",
        );
      }
      setStep(1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erreur lors de la mise à jour",
      );
    } finally {
      setLoading(false);
    }
  }

  async function addWorkstation() {
    const name = workstationInput.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/workstations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Erreur lors de la création",
        );
      }
      const ws = (await res.json()) as Workstation;
      setCreatedWorkstations((prev) => [...prev, ws]);
      setWorkstationInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  }

  function removeWorkstation(id: string) {
    setCreatedWorkstations((prev) => prev.filter((w) => w.id !== id));
  }

  async function addEmployee() {
    const name = employeeName.trim();
    const email = employeeEmail.trim();
    if (!name || !email) {
      setError("Nom et email sont requis");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          ...(createdWorkstations.length > 0 && {
            workstationIds: [createdWorkstations[0].id],
          }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Erreur lors de la création",
        );
      }
      const data = (await res.json()) as { id: string };
      const id = data.id;
      setAddedEmployees((prev) => [...prev, { id, name, email }]);
      setEmployeeName("");
      setEmployeeEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  }

  async function removeEmployee(index: number) {
    const emp = addedEmployees[index];
    if (!emp) return;
    try {
      await fetchWithCsrf(`/api/employees/${emp.id}`, { method: "DELETE" });
    } catch {
      // best-effort: remove from UI regardless
    }
    setAddedEmployees((prev) => prev.filter((_, i) => i !== index));
  }

  async function addTask() {
    const title = taskTitle.trim();
    if (!title) {
      setError("Le titre de la tâche est requis");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title,
        isRecurring: true,
        recurrenceType: "daily",
      };
      if (taskWorkstationId) body.workstationId = taskWorkstationId;
      const res = await fetchWithCsrf("/api/tasks/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Erreur lors de la création",
        );
      }
      setAddedTasks((prev) => [
        ...prev,
        { title, workstationId: taskWorkstationId },
      ]);
      setTaskTitle("");
      setTaskWorkstationId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  }

  function removeTask(index: number) {
    setAddedTasks((prev) => prev.filter((_, i) => i !== index));
  }

  function goToStep5() {
    setSummary({
      workstations: createdWorkstations.length,
      employees: addedEmployees.length,
      tasks: addedTasks.length,
    });
    setStep(4);
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4 selection:bg-primary/30">
      <div className="absolute inset-0 pointer-events-none mesh-gradient-bg opacity-40 z-0" />

      <div className="relative z-10 w-full max-w-lg animate-fade-in-up my-8">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Tasty Crousty"
            className="h-14 w-auto object-contain mx-auto mb-3"
          />
          <h1 className="text-2xl font-bold text-foreground">Bienvenue !</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configurez votre espace en quelques étapes.
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-primary via-accent to-primary opacity-20 blur-xl animate-pulse-glow pointer-events-none" />
          <div className="relative glass-card rounded-3xl shadow-2xl border border-border/50 p-6 md:p-8">
            <Stepper current={step} />

            {error && (
              <div className="mb-4 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Step 1 — Restaurant name */}
            {step === 0 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Nom de votre restaurant
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ce nom sera affiché sur votre tableau de bord et visible par
                    vos équipes.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Nom du restaurant
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Mon restaurant"
                    className="w-full px-4 py-3 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner"
                    onKeyDown={(e) => e.key === "Enter" && handleStep1Next()}
                  />
                </div>
                <button
                  onClick={handleStep1Next}
                  disabled={loading}
                  className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Suivant
                </button>
              </div>
            )}

            {/* Step 2 — Workstations */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Créer vos postes de travail
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les postes (ex: Cuisine, Caisse, Salle) permettent
                    d'organiser les tâches par zone. Vous pourrez en ajouter
                    plus tard.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workstationInput}
                    onChange={(e) => setWorkstationInput(e.target.value)}
                    placeholder="Ex: Cuisine"
                    className="flex-1 px-4 py-3 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner"
                    onKeyDown={(e) => e.key === "Enter" && addWorkstation()}
                  />
                  <button
                    onClick={addWorkstation}
                    disabled={loading || !workstationInput.trim()}
                    className="px-4 py-3 rounded-xl bg-primary/10 text-primary border border-primary/30 font-medium hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Ajouter"
                    )}
                  </button>
                </div>
                {createdWorkstations.length > 0 && (
                  <ul className="space-y-2">
                    {createdWorkstations.map((ws) => (
                      <li
                        key={ws.id}
                        className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="text-foreground">{ws.name}</span>
                        <button
                          onClick={() => removeWorkstation(ws.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setError(null);
                      setStep(2);
                    }}
                    className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-0.5"
                  >
                    Suivant
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setStep(2);
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                  >
                    Passer cette étape
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Employees */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Ajouter vos employés
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Invitez votre équipe. Chaque employé recevra un email pour
                    définir son mot de passe.
                  </p>
                </div>
                {createdWorkstations.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-600">
                    Aucun poste créé — l'employé sera ajouté sans poste assigné.
                    Vous pourrez l'assigner plus tard.
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="Nom"
                      className="flex-1 px-3 py-2.5 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner text-sm"
                    />
                    <input
                      type="email"
                      value={employeeEmail}
                      onChange={(e) => setEmployeeEmail(e.target.value)}
                      placeholder="Email"
                      className="flex-1 px-3 py-2.5 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner text-sm"
                    />
                  </div>
                  <button
                    onClick={addEmployee}
                    disabled={
                      loading || !employeeName.trim() || !employeeEmail.trim()
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-primary/10 text-primary border border-primary/30 font-medium hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Ajouter un employé
                  </button>
                </div>
                {addedEmployees.length > 0 && (
                  <ul className="space-y-2">
                    {addedEmployees.map((emp, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="text-foreground font-medium">
                            {emp.name}
                          </span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {emp.email}
                          </span>
                        </div>
                        <button
                          onClick={() => removeEmployee(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setError(null);
                      setStep(3);
                    }}
                    className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-0.5"
                  >
                    Suivant
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setStep(3);
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                  >
                    Passer cette étape
                  </button>
                </div>
              </div>
            )}

            {/* Step 4 — Tasks */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Créer vos premières tâches
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les tâches récurrentes sont automatiquement assignées chaque
                    jour. Vous pouvez les associer à un poste.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Ex: Nettoyer les tables"
                      className="flex-1 px-3 py-2.5 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner text-sm"
                    />
                    {createdWorkstations.length > 0 && (
                      <select
                        value={taskWorkstationId}
                        onChange={(e) => setTaskWorkstationId(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-input/60 bg-background/50 backdrop-blur-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 shadow-inner text-sm"
                      >
                        <option value="">Aucun poste</option>
                        {createdWorkstations.map((ws) => (
                          <option key={ws.id} value={ws.id}>
                            {ws.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    onClick={addTask}
                    disabled={loading || !taskTitle.trim()}
                    className="w-full px-4 py-2.5 rounded-xl bg-primary/10 text-primary border border-primary/30 font-medium hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Ajouter
                  </button>
                </div>
                {addedTasks.length > 0 && (
                  <ul className="space-y-2">
                    {addedTasks.map((task, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="text-foreground">{task.title}</span>
                          {task.workstationId && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {
                                createdWorkstations.find(
                                  (w) => w.id === task.workstationId,
                                )?.name
                              }
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeTask(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setError(null);
                      goToStep5();
                    }}
                    className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-0.5"
                  >
                    Suivant
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      goToStep5();
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                  >
                    Passer cette étape
                  </button>
                </div>
              </div>
            )}

            {/* Step 5 — Done */}
            {step === 4 && (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    Tout est prêt !
                  </h2>
                  <p className="text-muted-foreground text-sm mt-2">
                    Votre espace est configuré. Voici ce qui a été créé :
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                    <div className="text-2xl font-bold text-primary">
                      {summary.workstations}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Poste{summary.workstations !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                    <div className="text-2xl font-bold text-primary">
                      {summary.employees}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Employé{summary.employees !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50">
                    <div className="text-2xl font-bold text-primary">
                      {summary.tasks}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Tâche{summary.tasks !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Vous pouvez ajouter des postes, des employés et des tâches à
                  tout moment depuis votre tableau de bord.
                </p>
                <button
                  onClick={() => navigate("/manager/today")}
                  className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-0.5"
                >
                  Accéder au tableau de bord
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
