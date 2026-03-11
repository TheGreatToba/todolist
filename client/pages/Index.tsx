import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle2,
  Users,
  Zap,
  BarChart3,
  Clock,
  Shield,
  Menu,
  X,
} from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (user) {
    return (
      <Navigate
        to={user.role === "MANAGER" ? "/manager/dashboard" : "/employee"}
        replace
      />
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden selection:bg-primary/30">
      <div className="absolute inset-0 pointer-events-none mesh-gradient-bg opacity-40 z-0"></div>

      {/* Navigation */}
      <nav className="border-b border-border/50 bg-background/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Tasty Crousty"
              className="h-10 w-auto object-contain drop-shadow-sm transition-transform hover:scale-105"
            />
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-foreground">
              Tasty <span className="text-primary">Crousty</span>
            </h1>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              aria-label="Sign in"
              className="px-4 py-2 text-foreground font-semibold hover:text-primary transition-colors"
            >
              Se connecter
            </button>
            <button
              onClick={() => navigate("/signup")}
              aria-label="Get started"
              className="px-5 py-2.5 bg-primary/90 hover:bg-primary text-primary-foreground rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              Commencer
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-foreground"
              aria-label="Menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Nav Content */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl p-4 flex flex-col gap-4 animate-fade-in-up">
            <button
              onClick={() => navigate("/login")}
              aria-label="Sign in"
              className="w-full px-4 py-3 text-foreground font-semibold bg-secondary/50 rounded-xl transition-colors"
            >
              Se connecter
            </button>
            <button
              onClick={() => navigate("/signup")}
              aria-label="Get started"
              className="w-full px-5 py-3 bg-primary/90 hover:bg-primary text-primary-foreground rounded-xl font-bold shadow-lg"
            >
              Commencer
            </button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-24 md:py-40 text-center relative z-10 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-8 animate-pulse">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Nouvelle version disponible
        </div>
        <h2
          className="text-5xl md:text-7xl font-black mb-8 tracking-tight text-foreground drop-shadow-sm max-w-4xl mx-auto leading-tight"
          aria-label="Daily task management made simple"
        >
          La gestion des tâches quotidiennes,{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary animate-pulse-glow">
            simplifiée
          </span>
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-medium">
          Donnez à vos équipes une checklist mobile dynamique. Suivez
          l&apos;avancement des tâches en temps réel. Pilotez votre espace avec
          clarté et sérénité.
          <span className="sr-only">
            Empower your employees with a mobile-first checklist
          </span>
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-24 w-full">
          <button
            onClick={() => navigate("/signup")}
            className="w-full sm:w-auto px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg transition-all duration-300 shadow-[0_0_30px_rgba(233,30,99,0.3)] hover:shadow-[0_0_40px_rgba(233,30,99,0.5)] hover:-translate-y-1"
          >
            Commencer l'essai gratuit
          </button>
          <button
            onClick={() => navigate("/login")}
            className="w-full sm:w-auto px-8 py-4 bg-secondary/80 hover:bg-secondary text-foreground backdrop-blur-md rounded-2xl font-bold text-lg transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
          >
            Se connecter
          </button>
        </div>

        {/* Hero Image/Graphic */}
        <div className="relative mx-auto max-w-5xl">
          <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-primary via-accent to-primary opacity-30 blur-2xl animate-pulse-glow"></div>
          <div className="relative glass-card rounded-[2rem] border border-border/50 p-8 md:p-12 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
              {/* Employee View */}
              <div className="group relative rounded-2xl border border-border/50 bg-background/50 backdrop-blur-md p-8 shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:border-primary/50 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
                      <span className="text-2xl">📱</span>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                      Vue employé
                    </span>
                  </div>
                  <div className="space-y-5">
                    <div className="flex items-start gap-4 p-3 rounded-xl bg-card border border-border/50 shadow-sm">
                      <div className="mt-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-[0_0_10px_rgba(233,30,99,0.5)]">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          Préparation salle
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Terminée à 09:30
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 p-3 rounded-xl bg-card border border-border/50 shadow-sm relative overflow-hidden group/task">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                      <div className="mt-1 w-5 h-5 rounded-full border-2 border-primary flex-shrink-0"></div>
                      <div>
                        <p className="font-semibold text-foreground">
                          Check réapprovisionnement
                        </p>
                        <p className="text-xs text-primary mt-0.5 font-medium">
                          À faire maintenant
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Manager View */}
              <div className="group relative rounded-2xl border border-border/50 bg-background/50 backdrop-blur-md p-8 shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:border-accent/50 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
                      <span className="text-2xl">📊</span>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-3 py-1 rounded-full">
                      Vue manager
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border/50 shadow-sm">
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          Taux d'achèvement
                        </p>
                        <p className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent mt-1">
                          84%
                        </p>
                      </div>
                      <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary border-r-primary flex items-center justify-center">
                        <span className="text-xs font-bold text-foreground">
                          Auj.
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-xl bg-card border border-border/50 shadow-sm text-center">
                        <p className="text-xs text-muted-foreground font-semibold">
                          Tâches
                        </p>
                        <p className="text-xl font-bold text-foreground">42</p>
                      </div>
                      <div className="p-3 rounded-xl bg-card border border-border/50 shadow-sm text-center border-l-2 border-l-red-500">
                        <p className="text-xs text-muted-foreground font-semibold">
                          Retards
                        </p>
                        <p className="text-xl font-bold text-foreground">2</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-4 py-24 relative z-10">
        <h2
          className="text-4xl md:text-5xl font-black text-foreground mb-16 text-center tracking-tight drop-shadow-sm"
          aria-label="Key Features"
        >
          Fonctionnalités <span className="text-primary">Clés</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="glass-card rounded-3xl border border-border/50 p-8 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 group-hover:shadow-[0_0_20px_rgba(233,30,99,0.4)]">
              <Users className="w-7 h-7 text-primary group-hover:text-current" />
            </div>
            <h3
              className="text-xl font-bold text-foreground mb-3"
              aria-label="Team management"
            >
              Gestion d&apos;équipe
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Organisez les employés par postes et par équipes. Assignez les
              tâches automatiquement pour un pilotage sans accroc.
            </p>
          </div>

          <div className="glass-card rounded-3xl border border-border/50 p-8 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-300 hover:shadow-[0_0_20px_rgba(114,9,183,0.4)]">
              <Zap className="w-7 h-7 text-accent group-hover:text-current" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">
              Mises à jour en direct
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Visualisez les tâches terminées instantanément. Sans rechargement,
              restez informé de l'avancement de votre équipe.
              <span className="sr-only">Real-time updates</span>
            </p>
          </div>

          <div className="glass-card rounded-3xl border border-border/50 p-8 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 group-hover:shadow-[0_0_20px_rgba(233,30,99,0.4)]">
              <BarChart3 className="w-7 h-7 text-primary group-hover:text-current" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">
              Analyses pousées
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Suivez les taux d&apos;accomplissement et la performance des
              équipes avec des indicateurs visuels puissants.
            </p>
          </div>

          <div className="glass-card rounded-3xl border border-border/50 p-8 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 group-hover:shadow-[0_0_20px_rgba(233,30,99,0.4)]">
              <Clock className="w-7 h-7 text-primary group-hover:text-current" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">
              Pilote automatique
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Créez des tâches récurrentes qui s&apos;attribuent automatiquement
              chaque jour et réduisez l'administratif.
            </p>
          </div>

          <div className="glass-card rounded-3xl border border-border/50 p-8 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-300 group-hover:shadow-[0_0_20px_rgba(114,9,183,0.4)]">
              <Shield className="w-7 h-7 text-accent group-hover:text-current" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">
              Haute sécurité
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Vos données sont protégées avec des droits d&apos;accès stricts
              par rôle et une authentification renforcée.
            </p>
          </div>

          <div className="glass-card rounded-3xl border border-border/50 p-8 shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 group">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300 group-hover:shadow-[0_0_20px_rgba(233,30,99,0.4)]">
              <CheckCircle2 className="w-7 h-7 text-primary group-hover:text-current" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">
              Expérience premium
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Un design et une interface extrêmement intuitifs. Aucune formation
              n'est nécessaire pour l'adoption.
            </p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="relative overflow-hidden py-32 z-10">
        <div className="absolute inset-0 bg-secondary/30 backdrop-blur-3xl z-0 border-y border-border/50"></div>
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-20 text-center tracking-tight drop-shadow-sm">
            Idéal <span className="text-primary">pour</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="flex gap-6 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-card border border-border/50 shadow-md text-3xl group-hover:scale-110 transition-transform duration-300">
                  🏪
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Commerce & restauration
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Checklists quotidiennes pour la caisse, la cuisine,
                  l&apos;accueil et les opérations en magasin.
                </p>
              </div>
            </div>

            <div className="flex gap-6 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-card border border-border/50 shadow-md text-3xl group-hover:scale-110 transition-transform duration-300">
                  🏭
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Industrie & production
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Gestion des tâches d&apos;atelier, d&apos;assemblage et de
                  contrôle qualité.
                </p>
              </div>
            </div>

            <div className="flex gap-6 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-card border border-border/50 shadow-md text-3xl group-hover:scale-110 transition-transform duration-300">
                  🏥
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Santé & Cliniques
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Checklists de soins aux patients et répartition des tâches par
                  service de santé.
                </p>
              </div>
            </div>

            <div className="flex gap-6 group">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-card border border-border/50 shadow-md text-3xl group-hover:scale-110 transition-transform duration-300">
                  🏢
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Entreprises de Services
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Coordination des tâches entre services et management des
                  équipes opérationnelles.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 py-32 text-center relative z-10">
        <div className="glass-card rounded-[3rem] border border-border/50 p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 animate-pulse-glow"></div>
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6 tracking-tight">
              Prêt à transformer votre gestion ?
            </h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Rejoignez les équipes qui utilisent déjà Tasty Crousty pour
              digitaliser leurs opérations efficacement.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center w-full">
              <button
                onClick={() => navigate("/signup")}
                className="w-full sm:w-auto px-8 py-5 bg-primary hover:bg-primary/95 text-primary-foreground rounded-2xl font-bold text-lg transition-all duration-300 shadow-[0_0_20px_rgba(233,30,99,0.3)] hover:shadow-[0_0_30px_rgba(233,30,99,0.5)] hover:-translate-y-1"
              >
                Créer mon espace gratuitement
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background/80 backdrop-blur-md border-t border-border/50 py-10 relative z-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Tasty Crousty"
              className="h-8 w-auto grayscale opacity-50"
            />
            <span className="text-base font-bold text-muted-foreground">
              Tasty Crousty
            </span>
          </div>
          <p className="text-muted-foreground font-medium text-sm">
            &copy; {new Date().getFullYear()} Tasty Crousty. Tous droits
            réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
