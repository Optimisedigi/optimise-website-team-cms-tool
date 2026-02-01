import { describe, it, expect } from "vitest";
import { Users } from "@/collections/Users";

describe("Users Collection", () => {
  it("should have correct slug", () => {
    expect(Users.slug).toBe("users");
  });

  it("should have auth enabled", () => {
    expect(Users.auth).toBe(true);
  });

  it("should use email as title", () => {
    expect(Users.admin?.useAsTitle).toBe("email");
  });

  it("should be in Admin group", () => {
    expect(Users.admin?.group).toBe("Admin");
  });

  it("should have required name field", () => {
    const nameField = Users.fields.find(
      (f) => "name" in f && f.name === "name"
    );
    expect(nameField).toBeDefined();
    expect(nameField).toHaveProperty("required", true);
    expect(nameField).toHaveProperty("type", "text");
  });

  it("should have role field with admin/editor/writer options", () => {
    const roleField = Users.fields.find(
      (f) => "name" in f && f.name === "role"
    );
    expect(roleField).toBeDefined();
    expect(roleField).toHaveProperty("type", "select");
    if (roleField && "options" in roleField) {
      const values = roleField.options?.map((o: { value: string }) => o.value);
      expect(values).toContain("admin");
      expect(values).toContain("editor");
      expect(values).toContain("writer");
    }
  });

  it("should default role to writer", () => {
    const roleField = Users.fields.find(
      (f) => "name" in f && f.name === "role"
    );
    expect(roleField).toHaveProperty("defaultValue", "writer");
  });
});
