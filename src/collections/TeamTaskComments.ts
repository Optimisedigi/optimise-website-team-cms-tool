import type { Access, CollectionBeforeChangeHook, CollectionConfig } from "payload";
import { userHasFeature } from "../lib/access";

const hasTeamTaskAccess = (user: { role?: string } | null | undefined): boolean => {
  if (!user) return false;
  return user.role === "admin" || userHasFeature(user, "team-tasks");
};

const canReadComments: Access = ({ req }) => hasTeamTaskAccess(req.user as { role?: string } | null);
const canCreateComments: Access = ({ req }) => hasTeamTaskAccess(req.user as { role?: string } | null);

const canUpdateOwnOrManager: Access = ({ req }) => {
  const user = req.user as { id?: string | number; role?: string } | null;
  if (!hasTeamTaskAccess(user)) return false;
  if (user?.role === "admin" || user?.role === "manager") return true;
  if (user?.id == null) return false;
  return { author: { equals: user.id } } as any;
};

const setCommentAuthor: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (!data) return data;
  if (operation === "create" && req.user?.id && !data.author) {
    data.author = req.user.id;
  }
  return data;
};

export const TeamTaskComments: CollectionConfig = {
  slug: "team-task-comments",
  labels: {
    singular: "Team Task Comment",
    plural: "Team Task Comments",
  },
  admin: {
    group: "Clients",
    hidden: true,
    useAsTitle: "body",
    defaultColumns: ["task", "author", "createdAt"],
    description: "Comment history for team task detail panes.",
  },
  access: {
    read: canReadComments,
    create: canCreateComments,
    update: canUpdateOwnOrManager,
    delete: canUpdateOwnOrManager,
  },
  hooks: {
    beforeChange: [setCommentAuthor],
  },
  fields: [
    {
      name: "task",
      type: "relationship",
      relationTo: "team-tasks" as never,
      required: true,
      index: true,
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "body",
      type: "textarea",
      required: true,
      admin: {
        rows: 8,
      },
    },

  ],
  timestamps: true,
};
