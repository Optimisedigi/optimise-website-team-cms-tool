import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdditionalContactsField from "../../src/components/client-business/AdditionalContactsField";
import MapsListingsField from "../../src/components/client-business/MapsListingsField";
import AccountManagersField from "../../src/components/AccountManagersField";

const m = vi.hoisted(() => ({
  fields: {} as Record<string, { value?: unknown; valid?: boolean; errorMessage?: string }>,
  dispatch: vi.fn(),
  addFieldRow: vi.fn(),
  removeFieldRow: vi.fn(),
}));

vi.mock("@payloadcms/ui", () => ({
  useAllFormFields: () => [m.fields, m.dispatch],
  useForm: () => ({ addFieldRow: m.addFieldRow, removeFieldRow: m.removeFieldRow }),
}));

beforeEach(() => {
  m.dispatch.mockReset();
  m.addFieldRow.mockReset();
  m.removeFieldRow.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ managers: [] }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("AdditionalContactsField", () => {
  beforeEach(() => {
    m.fields = {
      "additionalContacts.0.id": { value: "a" },
      "additionalContacts.0.name": { value: "Jane Doe" },
      "additionalContacts.0.jobTitle": { value: "Owner" },
      "additionalContacts.0.email": { value: "jane@x.com" },
      "additionalContacts.0.phone": { value: "0400" },
      "additionalContacts.0.responsibilities": { value: "Approves budget" },
      "additionalContacts.1.id": { value: "b" },
      "additionalContacts.1.email": { value: "bad", valid: false, errorMessage: "Invalid email" },
    };
  });

  it("renders cards from form state", () => {
    render(<AdditionalContactsField path="additionalContacts" schemaPath="additionalContacts" />);
    expect(screen.getAllByTestId("contact-card")).toHaveLength(2);
    expect(screen.getByText("JD")).toBeTruthy();
    expect(screen.getByText("Unnamed contact")).toBeTruthy();
    expect(screen.getByRole("link", { name: "jane@x.com" }).getAttribute("href")).toBe("mailto:jane@x.com");
    expect(screen.getByText("Invalid email")).toBeTruthy();
  });

  it("adds a row", () => {
    render(<AdditionalContactsField path="additionalContacts" schemaPath="additionalContacts" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add contact" }));
    expect(m.addFieldRow).toHaveBeenCalledWith({ path: "additionalContacts", schemaPath: "additionalContacts", rowIndex: 2 });
  });

  it("edits and removes", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdditionalContactsField path="additionalContacts" schemaPath="additionalContacts" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "CEO" } });
    expect(m.dispatch).toHaveBeenCalledWith({ type: "UPDATE", path: "additionalContacts.0.jobTitle", value: "CEO" });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(m.removeFieldRow).toHaveBeenCalledWith({ path: "additionalContacts", rowIndex: 0 });
  });
});

describe("MapsListingsField", () => {
  it("renders, edits, adds, removes", () => {
    m.fields = {
      "googleMapsUrls.0.id": { value: "a" },
      "googleMapsUrls.0.url": { value: "https://maps.app/1" },
      "googleMapsUrls.0.label": { value: "Head Office" },
    };
    render(<MapsListingsField path="googleMapsUrls" schemaPath="googleMapsUrls" />);
    expect((screen.getByLabelText("Label for listing 1") as HTMLInputElement).value).toBe("Head Office");
    fireEvent.change(screen.getByLabelText("Google Maps URL for listing 1"), { target: { value: "https://x" } });
    expect(m.dispatch).toHaveBeenCalledWith({ type: "UPDATE", path: "googleMapsUrls.0.url", value: "https://x" });
    fireEvent.click(screen.getByRole("button", { name: /Add listing/ }));
    expect(m.addFieldRow).toHaveBeenCalledWith({ path: "googleMapsUrls", schemaPath: "googleMapsUrls", rowIndex: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Remove Head Office" }));
    expect(m.removeFieldRow).toHaveBeenCalledWith({ path: "googleMapsUrls", rowIndex: 0 });
  });

  it("hides add at 10 rows", () => {
    m.fields = {};
    for (let i = 0; i < 10; i++) m.fields[`googleMapsUrls.${i}.url`] = { value: `u${i}` };
    render(<MapsListingsField path="googleMapsUrls" schemaPath="googleMapsUrls" />);
    expect(screen.queryByRole("button", { name: /Add listing/ })).toBeNull();
  });
});

describe("AccountManagersField", () => {
  it("renders chips, adds, edits, removes", () => {
    m.fields = {
      "accountManagers.0.id": { value: "a" },
      "accountManagers.0.name": { value: "Peter Smith" },
      "accountManagers.0.email": { value: "p@x.com" },
    };
    render(<AccountManagersField path="accountManagers" schemaPath="accountManagers" />);
    expect(screen.getByTestId("manager-chip").textContent).toContain("PS");
    fireEvent.click(screen.getByRole("button", { name: "+ Add manager" }));
    expect(m.addFieldRow).toHaveBeenCalledWith({ path: "accountManagers", schemaPath: "accountManagers", rowIndex: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Edit Peter Smith" }));
    fireEvent.change(screen.getByLabelText("Account manager email"), { target: { value: "q@x.com" } });
    expect(m.dispatch).toHaveBeenCalledWith({ type: "UPDATE", path: "accountManagers.0.email", value: "q@x.com" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Peter Smith" }));
    expect(m.removeFieldRow).toHaveBeenCalledWith({ path: "accountManagers", rowIndex: 0 });
  });
});
