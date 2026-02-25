/**
 * MSW server for Node (Vitest). Use in test files that need semi-integrated API mocking.
 */
import { setupServer } from "msw/node";
import {
  loginSuccessHandler,
  profileUnauthorizedHandler,
  managerDashboardHandler,
  managerTodayBoardHandler,
  createTodayBoardTaskHandler,
  workstationsHandler,
  teamMembersHandler,
  taskTemplatesHandler,
  manualTriggerTemplatesHandler,
  createTaskFromTemplateHandler,
} from "./handlers";

export const server = setupServer(
  profileUnauthorizedHandler,
  loginSuccessHandler,
  managerDashboardHandler,
  managerTodayBoardHandler,
  createTodayBoardTaskHandler,
  workstationsHandler,
  teamMembersHandler,
  taskTemplatesHandler,
  manualTriggerTemplatesHandler,
  createTaskFromTemplateHandler,
);
