/**
 * Test router: MemoryRouter with React Router v7 future flags enabled.
 * Use in specs to avoid v7 migration warnings and prepare for upgrade.
 */
import type { MemoryRouterProps } from "react-router-dom";
import { MemoryRouter } from "react-router-dom";

const defaultFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

export function TestMemoryRouter({ future, ...props }: MemoryRouterProps) {
  return <MemoryRouter future={{ ...defaultFuture, ...future }} {...props} />;
}
