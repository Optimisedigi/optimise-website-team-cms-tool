"use client";

import { useId } from "react";
// @ts-ignore - RichTextField is not in the public exports but exists in dist
import { RichTextField } from "@payloadcms/richtext-lexical/field";

/**
 * Wraps the default Lexical RichTextField with a value-based key to force
 * reinitialization when the stored value changes. This works around a Payload
 * issue where the lexical editor's initialConfig is memoized without `value`
 * as a dependency, causing newly-added richText fields to appear empty (or
 * stuck in a state where edits are silently dropped) after the document loads.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TerminationOverrideField = (props: any) => {
  const { path } = props;
  const uid = useId();

  return (
    <RichTextField
      {...props}
      // Force a full remount when the path changes.
      // Without this, the editor may not pick up the loaded value.
      key={`${uid}-${path ?? "root"}`}
    />
  );
};
