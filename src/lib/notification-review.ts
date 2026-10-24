/**
 * Notification review page: groups every stored notification by category and
 * kind so an admin can mark each one keep/remove, add comments, and export the
 * decisions as JSON. Served (admin-only) by `/notifications-review`.
 *
 * Identical notifications fanned out to several recipients are merged into one
 * row (same kind + title + body + url) so the page lists each event once.
 */

import { NOTIFICATION_CATEGORIES, notificationCategory, type NotificationCategoryKey } from "@/lib/notification-categories";

export interface ReviewSourceRow {
  id: number | string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  readAt?: string | null;
  createdAt: string;
  recipient?: unknown;
}

export interface ReviewKindOption {
  label: string;
  value: string;
}

export interface ReviewItem {
  key: string;
  title: string;
  body: string | null;
  url: string | null;
  ids: string[];
  recipients: number;
  unread: number;
  firstSeen: string;
  lastSeen: string;
}

export interface ReviewKind {
  kind: string;
  label: string;
  total: number;
  unread: number;
  items: ReviewItem[];
}

export interface ReviewCategory {
  key: NotificationCategoryKey;
  label: string;
  color: string;
  total: number;
  kinds: ReviewKind[];
}

function recipientId(recipient: unknown): string {
  if (recipient && typeof recipient === "object" && "id" in recipient) return String((recipient as { id: unknown }).id);
  return recipient == null ? "" : String(recipient);
}

export function groupNotificationsForReview(
  rows: readonly ReviewSourceRow[],
  kindOptions: readonly ReviewKindOption[],
): ReviewCategory[] {
  const labelByKind = new Map(kindOptions.map((o) => [o.value, o.label]));
  const itemsByKind = new Map<string, Map<string, ReviewItem & { recipientSet: Set<string> }>>();
  for (const option of kindOptions) itemsByKind.set(option.value, new Map());

  for (const row of rows) {
    const kind = row.kind || "unknown";
    const body = row.body?.trim() || null;
    const url = row.url?.trim() || null;
    const key = JSON.stringify([kind, row.title, body, url]);
    let items = itemsByKind.get(kind);
    if (!items) {
      items = new Map();
      itemsByKind.set(kind, items);
    }
    const existing = items.get(key);
    const item = existing ?? {
      key,
      title: row.title,
      body,
      url,
      ids: [],
      recipients: 0,
      unread: 0,
      firstSeen: row.createdAt,
      lastSeen: row.createdAt,
      recipientSet: new Set<string>(),
    };
    item.ids.push(String(row.id));
    item.recipientSet.add(recipientId(row.recipient));
    item.recipients = item.recipientSet.size;
    if (!row.readAt) item.unread += 1;
    if (row.createdAt < item.firstSeen) item.firstSeen = row.createdAt;
    if (row.createdAt > item.lastSeen) item.lastSeen = row.createdAt;
    items.set(key, item);
  }

  const categories = new Map<NotificationCategoryKey, ReviewCategory>();
  for (const [kind, items] of itemsByKind) {
    const category = notificationCategory(kind);
    const list: ReviewItem[] = [...items.values()]
      .map(({ recipientSet: _recipients, ...item }) => ({ ...item, ids: [...item.ids].sort() }))
      .sort((a, b) => (a.lastSeen === b.lastSeen ? a.key.localeCompare(b.key) : b.lastSeen.localeCompare(a.lastSeen)));
    const reviewKind: ReviewKind = {
      kind,
      label: labelByKind.get(kind) ?? kind,
      total: list.reduce((n, i) => n + i.ids.length, 0),
      unread: list.reduce((n, i) => n + i.unread, 0),
      items: list,
    };
    const bucket = categories.get(category.key) ?? { ...category, total: 0, kinds: [] };
    bucket.kinds.push(reviewKind);
    bucket.total += reviewKind.total;
    categories.set(category.key, bucket);
  }

  const order = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategoryKey[];
  return order
    .flatMap((key) => {
      const c = categories.get(key);
      return c ? [c] : [];
    })
    .map((c) => ({
      ...c,
      kinds: [...c.kinds].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON safe to embed inside a <script> tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function renderNotificationReviewHtml(categories: readonly ReviewCategory[], generatedAt: string): string {
  const totalRows = categories.reduce((n, c) => n + c.total, 0);
  const totalKinds = categories.reduce((n, c) => n + c.kinds.length, 0);

  const sections = categories
    .map((category) => {
      const kinds = category.kinds
        .map((kind) => {
          const items = kind.items.length
            ? kind.items
                .map(
                  (item) => `
          <li class="item" data-item="${escapeHtml(item.key)}" data-kind="${escapeHtml(kind.kind)}">
            <div class="item-main">
              <div class="item-title">${escapeHtml(item.title)}</div>
              ${item.body ? `<div class="item-body">${escapeHtml(item.body)}</div>` : ""}
              <div class="item-meta">
                ${item.ids.length} sent · ${item.recipients} recipient${item.recipients === 1 ? "" : "s"} · ${item.unread} unread · last ${escapeHtml(item.lastSeen.slice(0, 10))}
                ${item.url ? ` · <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">link</a>` : ""}
              </div>
            </div>
            <div class="decision">
              <label><input type="checkbox" data-role="keep"> Keep</label>
              <label><input type="checkbox" data-role="remove"> Remove</label>
            </div>
            <textarea data-role="comment" placeholder="Comment (optional)" rows="1"></textarea>
          </li>`,
                )
                .join("")
            : `<li class="empty">No notifications of this kind are stored right now.</li>`;
          return `
      <details class="kind" data-kind-block="${escapeHtml(kind.kind)}">
        <summary>
          <span class="kind-label">${escapeHtml(kind.label)}</span>
          <code>${escapeHtml(kind.kind)}</code>
          <span class="count">${kind.total} total · ${kind.unread} unread · ${kind.items.length} distinct</span>
          <span class="kind-status" data-kind-status></span>
        </summary>
        <div class="kind-controls">
          <span>Whole kind:</span>
          <label><input type="checkbox" data-role="kind-keep"> Keep this kind</label>
          <label><input type="checkbox" data-role="kind-remove"> Remove this kind</label>
          <textarea data-role="kind-comment" placeholder="Comment on this kind, e.g. how it should show up (optional)" rows="2"></textarea>
        </div>
        <ul class="items">${items}</ul>
      </details>`;
        })
        .join("");
      return `
    <section class="category" style="--cat:${escapeHtml(category.color)}">
      <h2>${escapeHtml(category.label)} <span class="count">${category.total} notifications · ${category.kinds.length} kinds</span></h2>
      ${kinds}
    </section>`;
    })
    .join("");

  const exportData = categories.map((c) => ({
    category: c.label,
    kinds: c.kinds.map((k) => ({
      kind: k.kind,
      label: k.label,
      total: k.total,
      items: k.items.map((i) => ({ key: i.key, title: i.title, body: i.body, url: i.url, count: i.ids.length, ids: i.ids })),
    })),
  }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Notification review</title>
<style>
  :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { margin: 0; background: #f8fafc; color: #0f172a; }
  header { position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  header h1 { font-size: 18px; margin: 0 12px 0 0; }
  header .stats { color: #475569; font-size: 13px; }
  header .actions { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; }
  button { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; }
  button.primary { background: #0f172a; color: #fff; border-color: #0f172a; }
  input[type=search] { font: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; min-width: 220px; }
  main { max-width: 1100px; margin: 0 auto; padding: 20px; }
  .intro { color: #475569; font-size: 14px; margin: 0 0 20px; }
  .category { margin-bottom: 28px; }
  .category h2 { font-size: 16px; border-left: 4px solid var(--cat); padding-left: 10px; }
  .count { color: #64748b; font-weight: 400; font-size: 12px; }
  .kind { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid var(--cat); border-radius: 8px; margin: 8px 0; }
  .kind summary { cursor: pointer; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
  .kind-label { font-weight: 600; }
  code { font-size: 11px; color: #64748b; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
  .kind-status { margin-left: auto; font-size: 12px; font-weight: 600; }
  .kind-status.keep { color: #15803d; } .kind-status.remove { color: #b91c1c; } .kind-status.mixed { color: #a16207; }
  .kind-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 14px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 13px; }
  .kind-controls textarea { flex: 1 1 100%; }
  textarea { font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical; box-sizing: border-box; width: 100%; }
  .items { list-style: none; margin: 0; padding: 0; }
  .item { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; padding: 10px 14px; border-top: 1px solid #f1f5f9; }
  .item textarea { grid-column: 1 / -1; }
  .item.keep { background: #f0fdf4; } .item.remove { background: #fef2f2; }
  .item-title { font-size: 14px; font-weight: 500; }
  .item-body { font-size: 13px; color: #334155; margin-top: 2px; }
  .item-meta { font-size: 12px; color: #64748b; margin-top: 4px; }
  .decision { display: flex; gap: 12px; font-size: 13px; align-items: start; white-space: nowrap; }
  .empty { padding: 10px 14px; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9; }
  .hidden { display: none !important; }
  @media (max-width: 640px) { .item { grid-template-columns: 1fr; } header .actions { margin-left: 0; } }
</style>
</head>
<body>
<header>
  <h1>Notification review</h1>
  <span class="stats">${totalRows} stored notifications · ${totalKinds} kinds · generated ${escapeHtml(generatedAt)}</span>
  <span class="stats" id="progress"></span>
  <div class="actions">
    <input type="search" id="filter" placeholder="Filter by text…" aria-label="Filter notifications">
    <button type="button" id="expand">Expand all</button>
    <button type="button" id="reset">Reset</button>
    <button type="button" class="primary" id="export">Export JSON</button>
  </div>
</header>
<main>
  <p class="intro">Tick <strong>Keep</strong> or <strong>Remove</strong> for each notification, or decide a whole kind at once. Add comments where something should show up differently. Your choices are saved in this browser as you go. When done, click <strong>Export JSON</strong> and send the file back.</p>
  ${sections || '<p class="intro">No notifications found.</p>'}
</main>
<script id="review-data" type="application/json">${scriptJson(exportData)}</script>
<script>
(function () {
  var STORAGE_KEY = "notification-review-v1";
  var data = JSON.parse(document.getElementById("review-data").textContent);
  var state = { kinds: {}, items: {} };
  try { var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (saved && saved.kinds && saved.items) state = saved; } catch (e) {}
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
  function entry(map, key) { return map[key] || (map[key] = { decision: null, comment: "" }); }

  function paintItem(li) {
    var s = state.items[li.dataset.item] || {};
    li.querySelector('[data-role=keep]').checked = s.decision === "keep";
    li.querySelector('[data-role=remove]').checked = s.decision === "remove";
    li.querySelector('[data-role=comment]').value = s.comment || "";
    li.classList.toggle("keep", s.decision === "keep");
    li.classList.toggle("remove", s.decision === "remove");
  }
  function paintKind(block) {
    var kind = block.dataset.kindBlock;
    var s = state.kinds[kind] || {};
    block.querySelector('[data-role=kind-keep]').checked = s.decision === "keep";
    block.querySelector('[data-role=kind-remove]').checked = s.decision === "remove";
    block.querySelector('[data-role=kind-comment]').value = s.comment || "";
    var lis = block.querySelectorAll(".item");
    var keep = 0, remove = 0;
    lis.forEach(function (li) { var d = (state.items[li.dataset.item] || {}).decision; if (d === "keep") keep++; if (d === "remove") remove++; });
    var status = block.querySelector("[data-kind-status]");
    var text = "", cls = "";
    if (s.decision) { text = s.decision === "keep" ? "Keep kind" : "Remove kind"; cls = s.decision; }
    else if (keep || remove) { text = keep + " keep · " + remove + " remove · " + (lis.length - keep - remove) + " undecided"; cls = keep && remove ? "mixed" : keep ? "keep" : "remove"; }
    status.textContent = text;
    status.className = "kind-status " + cls;
  }
  function paintProgress() {
    var lis = document.querySelectorAll(".item"), done = 0;
    lis.forEach(function (li) { if ((state.items[li.dataset.item] || {}).decision) done++; });
    document.getElementById("progress").textContent = done + " / " + lis.length + " notifications decided";
  }
  function paintAll() {
    document.querySelectorAll(".item").forEach(paintItem);
    document.querySelectorAll("[data-kind-block]").forEach(paintKind);
    paintProgress();
  }

  document.addEventListener("change", function (e) {
    var t = e.target, role = t.dataset && t.dataset.role;
    if (!role) return;
    var li = t.closest(".item");
    var block = t.closest("[data-kind-block]");
    if (li && (role === "keep" || role === "remove")) {
      entry(state.items, li.dataset.item).decision = t.checked ? role : null;
    } else if (block && (role === "kind-keep" || role === "kind-remove")) {
      var decision = t.checked ? role.slice(5) : null;
      entry(state.kinds, block.dataset.kindBlock).decision = decision;
      // Deciding a whole kind applies to every notification in it.
      block.querySelectorAll(".item").forEach(function (item) { entry(state.items, item.dataset.item).decision = decision; });
    } else { return; }
    save(); paintAll();
  });
  document.addEventListener("input", function (e) {
    var t = e.target, role = t.dataset && t.dataset.role;
    if (role === "comment") entry(state.items, t.closest(".item").dataset.item).comment = t.value;
    else if (role === "kind-comment") entry(state.kinds, t.closest("[data-kind-block]").dataset.kindBlock).comment = t.value;
    else return;
    save();
  });

  document.getElementById("filter").addEventListener("input", function (e) {
    var q = e.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-kind-block]").forEach(function (block) {
      var kindText = block.querySelector("summary").textContent.toLowerCase();
      var any = false;
      block.querySelectorAll(".item").forEach(function (li) {
        var match = !q || kindText.indexOf(q) >= 0 || li.textContent.toLowerCase().indexOf(q) >= 0;
        li.classList.toggle("hidden", !match);
        if (match) any = true;
      });
      block.classList.toggle("hidden", Boolean(q) && !any && kindText.indexOf(q) < 0);
      if (q && any) block.open = true;
    });
  });
  document.getElementById("expand").addEventListener("click", function () {
    var blocks = document.querySelectorAll("[data-kind-block]");
    var open = Array.prototype.some.call(blocks, function (b) { return !b.open; });
    blocks.forEach(function (b) { b.open = open; });
    this.textContent = open ? "Collapse all" : "Expand all";
  });
  document.getElementById("reset").addEventListener("click", function () {
    if (!confirm("Clear all keep/remove choices and comments?")) return;
    state = { kinds: {}, items: {} }; save(); paintAll();
  });
  document.getElementById("export").addEventListener("click", function () {
    var out = {
      exportedAt: new Date().toISOString(),
      generatedAt: ${scriptJson(generatedAt)},
      categories: data.map(function (c) {
        return {
          category: c.category,
          kinds: c.kinds.map(function (k) {
            var ks = state.kinds[k.kind] || {};
            return {
              kind: k.kind, label: k.label, total: k.total,
              kindDecision: ks.decision || null, kindComment: ks.comment || "",
              items: k.items.map(function (i) {
                var s = state.items[i.key] || {};
                return { title: i.title, body: i.body, url: i.url, count: i.count, ids: i.ids, decision: s.decision || null, comment: s.comment || "" };
              })
            };
          })
        };
      })
    };
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "notification-review-" + out.exportedAt.slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  paintAll();
})();
</script>
</body>
</html>`;
}
