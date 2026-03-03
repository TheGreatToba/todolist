import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle2,
  Users,
  Zap,
  BarChart3,
  Clock,
  Shield,
} from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) {
    return (
      <Navigate
        to={user.role === "MANAGER" ? "/manager/today" : "/employee"}
        replace
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Tasty Crousty"
              className="h-10 w-auto object-contain"
            />
            <h1 className="text-2xl font-bold text-foreground">
              Tasty Crousty
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 text-foreground hover:text-primary transition font-medium"
            >
              Se connecter
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
            >
              Commencer
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-20 md:py-32 text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
          La gestion des tâches quotidiennes, simplifiée
        </h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Donnez à vos équipes une checklist mobile. Suivez l&apos;avancement
          des tâches en temps réel. Pilotez votre équipe avec clarté et
          sérénité.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <button
            onClick={() => navigate("/signup")}
            className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-lg transition shadow-lg hover:shadow-xl"
          >
            Essai gratuit
          </button>
          <button
            onClick={() => navigate("/login")}
            className="px-8 py-4 border-2 border-primary text-primary hover:bg-primary/5 rounded-lg font-semibold text-lg transition"
          >
            Se connecter
          </button>
        </div>

        {/* Hero Image/Graphic */}
        <div className="bg-gradient-to-b from-primary/10 to-transparent rounded-2xl border border-border p-12 mb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Employee View */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">📱</span>
                </div>
                <h3 className="font-semibold text-foreground">Vue employé</h3>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Conçu d&apos;abord pour le mobile
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Checklist des tâches quotidiennes
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Synchronisation en temps réel
                  </span>
                </div>
              </div>
            </div>

            {/* Manager View */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">📊</span>
                </div>
                <h3 className="font-semibold text-foreground">Vue manager</h3>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Vue d&apos;ensemble de l&apos;équipe
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Suivi des tâches en direct
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Statistiques de progression
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-foreground mb-12 text-center">
          Fonctionnalités clés
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Gestion d&apos;équipe
            </h3>
            <p className="text-muted-foreground">
              Organisez les employés par postes et par équipes. Assignez les
              tâches automatiquement.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Mises à jour en temps réel
            </h3>
            <p className="text-muted-foreground">
              Visualisez les tâches terminées instantanément. Sans rechargement.
              Restez informé en permanence.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Analyses
            </h3>
            <p className="text-muted-foreground">
              Suivez les taux d&apos;accomplissement et la performance des
              équipes. Décisions guidées par la donnée.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Récurrence quotidienne
            </h3>
            <p className="text-muted-foreground">
              Créez des tâches récurrentes qui s&apos;attribuent automatiquement
              chaque jour. Moins d&apos;administratif.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Authentification sécurisée
            </h3>
            <p className="text-muted-foreground">
              Droits d&apos;accès par rôle. Authentification sécurisée par JWT.
            </p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Interface simple
            </h3>
            <p className="text-muted-foreground">
              Design intuitif. Facile à prendre en main. Aucune formation
              nécessaire.
            </p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="bg-card border-t border-b border-border py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-foreground mb-12 text-center">
            Idéal pour
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏪
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Commerce & restauration
                </h3>
                <p className="text-muted-foreground mt-2">
                  Checklists quotidiennes pour la caisse, la cuisine,
                  l&apos;accueil et les opérations en magasin.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏭
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Industrie & production
                </h3>
                <p className="text-muted-foreground mt-2">
                  Gestion des tâches d&apos;atelier, d&apos;assemblage et de
                  contrôle qualité.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏥
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Santé</h3>
                <p className="text-muted-foreground mt-2">
                  Checklists de soins aux patients et répartition des tâches par
                  service.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏢
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Entreprises
                </h3>
                <p className="text-muted-foreground mt-2">
                  Coordination des tâches entre services et management des
                  équipes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-foreground mb-6">
          Prêt à démarrer ?
        </h2>
        <p className="text-lg text-muted-foreground mb-8">
          Rejoignez les équipes qui utilisent déjà Tasty Crousty pour gérer
          leurs tâches quotidiennes efficacement.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate("/signup")}
            className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-lg transition shadow-lg hover:shadow-xl"
          >
            Créer un compte
          </button>
          <button
            onClick={() => navigate("/login")}
            className="px-8 py-4 border-2 border-primary text-primary hover:bg-primary/5 rounded-lg font-semibold text-lg transition"
          >
            Se connecter
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; 2025 Tasty Crousty. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
