import { describe, expect, it } from "vitest";
import { createLocaleExample } from "../src/locale-client";

describe("locale form retirement", () => {
  it("keeps an outgoing React form subscribable until the replacement commits", () => {
    const example = createLocaleExample("en-US", { deferFormDisposal: true });
    try {
      const previous = example.getForm();
      expect(example.setLocale("ar-EG")).toBe(true);
      // React may install the previous commit's passive subscription after the
      // event replaced the form, before rendering the replacement.
      let unsubscribe = () => {};
      expect(() => { unsubscribe = previous.subscribe(() => {}); }).not.toThrow();
      // The outgoing render's own passive effect must not retire the form it
      // rendered when React flushes that effect before committing the new form.
      example.releaseRetiredForms(previous);
      expect(() => previous.subscribe(() => {})()).not.toThrow();
      expect(example.getForm()).not.toBe(previous);
      example.releaseRetiredForms(example.getForm());
      expect(() => previous.subscribe(() => {})).toThrow("Row editing form is disposed");
      expect(() => unsubscribe()).not.toThrow();
      expect(example.getForm().getState().rows).toHaveLength(1);
    } finally { example.dispose(); }
  });

  it("releases every outgoing form and preserves canonical drafts", () => {
    const example = createLocaleExample("en-US", { deferFormDisposal: true });
    try {
      const first = example.getForm();
      first.setInput("a", "name", "preserved draft");
      example.setLocale("de-DE");
      const second = example.getForm();
      example.setLocale("ar-EG");
      example.releaseRetiredForms();
      for (const previous of [first, second]) expect(() => previous.subscribe(() => {})).toThrow("Row editing form is disposed");
      expect(example.getForm().getState().rows[0]?.fields.find((field) => field.definition.id === "name")?.input).toBe("preserved draft");
      expect(() => example.releaseRetiredForms()).not.toThrow();
    } finally { example.dispose(); }
  });

  it("disposes pending and active forms when the example unmounts", () => {
    const example = createLocaleExample("en-US", { deferFormDisposal: true });
    const previous = example.getForm();
    example.setLocale("ar-EG");
    const active = example.getForm();
    example.dispose();
    for (const form of [previous, active]) expect(() => form.subscribe(() => {})).toThrow("Row editing form is disposed");
    expect(() => example.dispose()).not.toThrow();
  });

  it("retains immediate disposal for synchronous consumers", () => {
    const example = createLocaleExample();
    try {
      const previous = example.getForm();
      example.setLocale("de-DE");
      expect(() => previous.subscribe(() => {})).toThrow("Row editing form is disposed");
    } finally { example.dispose(); }
  });
});
