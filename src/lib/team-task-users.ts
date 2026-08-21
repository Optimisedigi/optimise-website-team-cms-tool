export interface AssignableTeamTaskUser {
  id: string | number;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export function isAssignableTeamTaskUser(user: Pick<AssignableTeamTaskUser, "email" | "name">): boolean {
  return user.email !== "admin@optimise.digital" && user.name !== "Admin User";
}

export function toTeamTaskUserOption(user: AssignableTeamTaskUser) {
  return {
    id: String(user.id),
    name: user.name || user.email || "Unnamed user",
    email: user.email || undefined,
    role: user.role || undefined,
  };
}
