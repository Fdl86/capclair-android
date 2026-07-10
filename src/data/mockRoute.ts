import type { NavBranch, NavPoint, NavRoute } from '../domain/navigation.types';
import { buildBranches, buildRoute, createDefaultRoute } from '../services/navigation/routeBuilder';

export const mockRoute: NavRoute = createDefaultRoute();
export const mockPoints: NavPoint[] = mockRoute.points;

export { buildBranches, buildRoute };
export type { NavBranch, NavPoint, NavRoute };
