import { describe, it, expect } from "vitest";
import { Users } from "@/collections/Users";

describe("Users Collection", () => {
  it("should have correct slug", () => {
    expect(Users.slug).toBe("users");
  });

  it("should configure login attempts and the two-hour idle-session token", () => {
    expect(Users.auth).toEqual({
      maxLoginAttempts: 5,
      tokenExpiration: 7200,
    });
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

  it("should have role field with admin/manager/specialist options", () => {
    const roleField = Users.fields.find(
      (f) => "name" in f && f.name === "role"
    );
    expect(roleField).toBeDefined();
    expect(roleField).toHaveProperty("type", "select");
    if (roleField && "options" in roleField) {
      const values = roleField.options?.map((o) => typeof o === "string" ? o : o.value);
      expect(values).toContain("admin");
      expect(values).toContain("manager");
      expect(values).toContain("specialist");
    }
  });

  it("should default role to specialist", () => {
    const roleField = Users.fields.find(
      (f) => "name" in f && f.name === "role"
    );
    expect(roleField).toHaveProperty("defaultValue", "specialist");
  });
});
