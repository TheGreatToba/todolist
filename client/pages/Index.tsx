import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Users, Zap, BarChart3, Clock, Shield } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) {
    return (
      <Navigate
        to={user.role === 'MANAGER' ? '/manager' : '/employee'}
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
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground">TaskFlow</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-foreground hover:text-primary transition font-medium"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition"
            >
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-20 md:py-32 text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
          Daily Task Management Made Simple
        </h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Empower your employees with a mobile-first checklist. Monitor task completion in real-time.
          Manage your team with clarity and ease.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <button
            onClick={() => navigate('/signup')}
            className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-lg transition shadow-lg hover:shadow-xl"
          >
            Start Free Trial
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-4 border-2 border-primary text-primary hover:bg-primary/5 rounded-lg font-semibold text-lg transition"
          >
            Sign in
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
                <h3 className="font-semibold text-foreground">Employee View</h3>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Mobile-first design</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Daily task checklist</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Real-time sync</span>
                </div>
              </div>
            </div>

            {/* Manager View */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">📊</span>
                </div>
                <h3 className="font-semibold text-foreground">Manager Dashboard</h3>
              </div>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Team overview</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Live task tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Progress analytics</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-foreground mb-12 text-center">Key Features</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Team Management</h3>
            <p className="text-muted-foreground">Organize employees by workstations and teams. Assign tasks automatically.</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Real-time Updates</h3>
            <p className="text-muted-foreground">See task completions instantly. No refresh needed. Stay informed.</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Analytics</h3>
            <p className="text-muted-foreground">Track completion rates and team performance. Data-driven insights.</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Daily Recurring</h3>
            <p className="text-muted-foreground">Set recurring tasks that auto-assign each day. Less admin work.</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Secure Auth</h3>
            <p className="text-muted-foreground">Role-based access control. Secure JWT authentication included.</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-8 shadow-sm hover:shadow-md transition">
            <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Simple Interface</h3>
            <p className="text-muted-foreground">Intuitive design. Easy to learn. No training needed.</p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="bg-card border-t border-b border-border py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-foreground mb-12 text-center">Perfect For</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏪
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Retail & Hospitality</h3>
                <p className="text-muted-foreground mt-2">Daily checklists for checkout, kitchen, reception, and store operations.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏭
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Manufacturing</h3>
                <p className="text-muted-foreground mt-2">Workshop, assembly, and quality control station task management.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏥
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Healthcare</h3>
                <p className="text-muted-foreground mt-2">Patient care checklists and departmental task assignments.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-primary-foreground">
                  🏢
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Corporate</h3>
                <p className="text-muted-foreground mt-2">Department-wide task coordination and team management.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-foreground mb-6">Ready to get started?</h2>
        <p className="text-lg text-muted-foreground mb-8">Join teams already using TaskFlow to manage daily tasks efficiently.</p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/signup')}
            className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-lg transition shadow-lg hover:shadow-xl"
          >
            Create Account
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-4 border-2 border-primary text-primary hover:bg-primary/5 rounded-lg font-semibold text-lg transition"
          >
            Sign in
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; 2025 TaskFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
