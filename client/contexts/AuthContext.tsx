import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import type { User } from "@shared/api";
import { useProfileQuery, queryKeys } from "@/hooks/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithCsrf } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  /** Set when profile fetch fails (network/backend), distinct from "not authenticated". */
  profileError: Error | null;
  refetchProfile: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileIsError,
    error: profileError,
  } = useProfileQuery();

  const user = profile?.user ?? null;
  const isAuthenticated = !!user;

  const loginMutation = useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const response = await fetchWithCsrf("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Login failed");
      }
      return response.json() as Promise<{ user: User }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.profile, data);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "An error occurred");
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (body: {
      name: string;
      email: string;
      password: string;
    }) => {
      const response = await fetchWithCsrf("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          role: "MANAGER",
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Signup failed");
      }
      return response.json() as Promise<{ user: User }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.profile, data);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "An error occurred");
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      setError(null);
      await signupMutation.mutateAsync({ name, email, password });
    },
    [signupMutation],
  );

  const refetchProfile = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile });
  }, [queryClient]);

  const logout = useCallback(() => {
    setError(null);
    queryClient.setQueryData(queryKeys.auth.profile, { user: null });
    fetchWithCsrf("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, [queryClient]);

  const isLoading =
    profileLoading || loginMutation.isPending || signupMutation.isPending;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        signup,
        logout,
        isLoading,
        error,
        profileError: profileIsError ? (profileError ?? null) : null,
        refetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
