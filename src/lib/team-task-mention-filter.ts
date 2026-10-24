/**
 * Which team-task comments are worth a bell notification.
 *
 * A comment that only says the task is done ("@Peter done with this",
 * "done here boss") gives the person mentioned nothing to read or act on, so
 * it is saved on the task but raises no notification. Anything with more to
 * it ("done with this. I hope I did it right", "done, see attached") still
 * notifies, as does a comment carrying an image or link.
 */

const FILLER = "(?:boss|peter|thanks|thank you|thx|cheers|ty)";
const BARE_DONE_RE = new RegExp(
  `^(?:(?:hi|hey) )?(?:(?:i am|i'm|im|i) )?(?:all )?done` +
    `(?: (?:with|on))?(?: (?:this|these|it|that|here|this one|this task|the task))?` +
    `(?: ${FILLER})*$`,
);

export function isBareDoneComment(body: string): boolean {
  const raw = body ?? "";
  // Attachments or links are something to look at.
  if (/<img\b|<a\b|https?:\/\//i.test(raw)) return false;
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text !== "" && BARE_DONE_RE.test(text);
}
