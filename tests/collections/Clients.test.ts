import { describe, it, expect } from "vitest";
import { Clients } from "@/collections/Clients";

describe("Clients Collection", () => {
  it("should have correct slug", () => {
    expect(Clients.slug).toBe("clients");
  });

  it("should have required name field", () => {
    const nameField = Clients.fields.find(
      (f) => "name" in f && f.name === "name"
    );
    expect(nameField).toBeDefined();
    expect(nameField).toHaveProperty("required", true);
    expect(nameField).toHaveProperty("type", "text");
  });

  it("should have required unique slug field", () => {
    const slugField = Clients.fields.find(
      (f) => "name" in f && f.name === "slug"
    );
    expect(slugField).toBeDefined();
    expect(slugField).toHaveProperty("required", true);
    expect(slugField).toHaveProperty("unique", true);
    expect(slugField).toHaveProperty("type", "text");
  });

  it("should have apiKey field with auto-generation hook", () => {
    const apiKeyField = Clients.fields.find(
      (f) => "name" in f && f.name === "apiKey"
    );
    expect(apiKeyField).toBeDefined();
    expect(apiKeyField).toHaveProperty("hooks");
  });

  it("should have isActive checkbox with default true", () => {
    const isActiveField = Clients.fields.find(
      (f) => "name" in f && f.name === "isActive"
    );
    expect(isActiveField).toBeDefined();
    expect(isActiveField).toHaveProperty("type", "checkbox");
    expect(isActiveField).toHaveProperty("defaultValue", true);
  });

  it("should be in Settings admin group", () => {
    expect(Clients.admin?.group).toBe("Settings");
  });

  it("should use name as title", () => {
    expect(Clients.admin?.useAsTitle).toBe("name");
  });
});
