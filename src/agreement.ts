/**
 * The service agreement itself: what one is, the status flow, the built-in clause
 * library, and the renderers.
 *
 * A service agreement is the document a freelancer and a client sign BEFORE the work
 * starts: who the parties are, what services are provided, what the client receives at
 * the end, what it costs and when it is paid, how long it runs, how either party ends
 * it, where liability stops, and which law governs it. It is not an invoice (that bills
 * the work) and not a proposal (that sells the work): it is the terms the work is done
 * under.
 *
 * The rendered document is a template, not legal advice, and every render says so in
 * one line. Nothing in this module touches the network.
 */

export const MAX_CENTS = 1e14;
export const MAX_DELIVERABLES = 50;
export const MAX_NOTICE_DAYS = 365;

/** draft while it is being written, sent to the client, signed by both, expired at the end. */
export const FLOW = ["draft", "sent", "signed", "expired"] as const;
export type Status = (typeof FLOW)[number];

export type RateUnit = "hour" | "day" | "project";
export const RATE_UNITS: readonly RateUnit[] = ["hour", "day", "project"];

export interface StatusChange {
  status: Status;
  date: string;             // YYYY-MM-DD the step is stamped with
  note?: string;
  at: string;               // ISO timestamp of the call
}

export interface Agreement {
  id: string;               // SA-YYYY-NNNN
  freelancer: string;       // who does the work
  client: string;           // who the work is for
  freelancer_address?: string | null;
  client_address?: string | null;
  scope: string;            // the services provided
  deliverables: string[];   // what the client receives
  rate_cents: number;       // the rate, integer cents
  rate_unit: RateUnit;      // what the rate buys: an hour, a day, or the whole project
  currency: string;         // 3-letter ISO, uppercased; a cent is 1/100 of it
  payment_terms: string;    // when and how it is paid, e.g. Net 14 from invoice
  start_date: string | null;
  end_date: string | null;
  termination_notice_days: number | null;
  liability_cap_cents: number | null;
  jurisdiction: string | null;
  clauses: string[];        // ids of library clauses included in this agreement
  status: Status;
  history: StatusChange[];
  note?: string;
  created: string;
  updated: string;
}

/** Buyer spelling with a dash or a space is the same step. */
export function normalizeStatus(s: string): Status | null {
  const t = s.trim().toLowerCase().replace(/[- ]/g, "_");
  return (FLOW as readonly string[]).includes(t) ? (t as Status) : null;
}

/** The one step an agreement is allowed to move, or null at the end of the flow. */
export function nextStatus(s: Status): Status | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

/** An agreement counts against the free tier until it is expired. */
export function isActive(a: Agreement): boolean {
  return a.status !== "expired";
}

/** "EUR 85.00", sign before the digits, no thousand separators. */
export function money(cents: number, currency: string): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${currency} ${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The local calendar date, YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "per hour" / "per day" / "for the project". */
export function ratePhrase(unit: RateUnit): string {
  return unit === "project" ? "for the project" : `per ${unit}`;
}

export const DISCLAIMER = "This agreement is a template, not legal advice.";

/* ------------------------------------------------------------- clause library */

export interface Clause {
  id: string;
  title: string;
  summary: string;          // one line, shown on the free tier
  body: string;             // full text with {{variables}}, Pro tier
}

/**
 * The built-in library. Bodies carry {{variables}} that are filled from the agreement
 * they are attached to; a fixed number inside a clause (two years, 1.5%, 25%, two
 * rounds) is part of the template text and is edited in the text like anything else.
 */
export const CLAUSES: readonly Clause[] = [
  {
    id: "ip_assignment",
    title: "Intellectual property assignment",
    summary: "IP in the deliverables passes to the client on payment in full; until then it stays with the freelancer, who keeps the right to show the work in a portfolio.",
    body:
      `On payment in full of every amount due under this agreement, {{freelancer_name}} assigns to {{client_name}} all intellectual property rights in the deliverables. ` +
      `Until that payment, all rights in the deliverables remain with {{freelancer_name}}. ` +
      `{{freelancer_name}} retains the right to display the work, and reference to it, in a portfolio and similar self-promotion.`,
  },
  {
    id: "confidentiality",
    title: "Mutual confidentiality",
    summary: "Each party keeps the other's non-public information confidential during the engagement and for two years after it ends.",
    body:
      `Each party will keep the other's non-public business, technical and financial information confidential, will use it only to perform this agreement, ` +
      `and will not disclose it to any third party without the other's written consent. This obligation applies during the term of this agreement and for two years after it ends, ` +
      `and does not cover information that is public, already known, independently developed, or required to be disclosed by the law of {{jurisdiction}}.`,
  },
  {
    id: "late_payment",
    title: "Late payment interest",
    summary: "Amounts unpaid past the agreed payment terms accrue interest at 1.5% per month, or the legal maximum if that is less.",
    body:
      `Any amount not paid within the terms set out in the Payment section ({{payment_terms}}) accrues interest at 1.5% per month, ` +
      `or the maximum rate permitted by the law of {{jurisdiction}} if that is less, from the due date until payment is received in full.`,
  },
  {
    id: "kill_fee",
    title: "Kill fee",
    summary: "If the client cancels after work has started, the client pays for work done to date plus 25% of the remaining fee.",
    body:
      `If {{client_name}} cancels this agreement after work has started, {{client_name}} will pay for all work completed up to the cancellation date, ` +
      `plus 25% of the fee that would otherwise remain. On that payment, {{freelancer_name}} will hand over the deliverables paid for in their state at cancellation.`,
  },
  {
    id: "revision_rounds",
    title: "Revision rounds",
    summary: "The fee includes two rounds of revisions per deliverable; further rounds are billed at the agreed rate.",
    body:
      `The fee includes two rounds of revisions per deliverable. A round is one consolidated set of comments from {{client_name}} turned around by {{freelancer_name}}. ` +
      `Further rounds, and changes to the agreed scope, are billed at the rate set out in the Payment section and agreed in writing before the work is done.`,
  },
];

export function findClause(id: string): Clause | undefined {
  const needle = id.trim().toLowerCase();
  return CLAUSES.find((c) => c.id === needle);
}

/**
 * The variables a clause body can carry, filled from one agreement. Anything the
 * agreement does not hold becomes a bracketed prompt so a printed draft shows the gap
 * instead of hiding it.
 */
export function clauseVariables(a: Agreement): Record<string, string> {
  return {
    freelancer_name: a.freelancer,
    client_name: a.client,
    jurisdiction: a.jurisdiction ?? "[add: jurisdiction]",
    payment_terms: a.payment_terms,
    termination_notice_days: a.termination_notice_days === null ? "[add: termination notice days]" : String(a.termination_notice_days),
    liability_cap: a.liability_cap_cents === null ? "[add: liability cap]" : money(a.liability_cap_cents, a.currency),
    rate: `${money(a.rate_cents, a.currency)} ${ratePhrase(a.rate_unit)}`,
  };
}

/** Fill a clause body with the agreement's variables. Unknown tokens are left as-is. */
export function substitute(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (tok, key: string) => vars[key] ?? tok);
}

/* ------------------------------------------------------------------ checklist */

export interface ChecklistItem {
  item: string;
  ok: boolean;
  detail: string;
}

/**
 * The before-you-send-it checklist. Missing fields are listed, and terms whose absence
 * cuts one way are flagged neutrally: what the gap means as written, for both parties,
 * without advising anyone what to do about it.
 */
export function checklist(a: Agreement): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  items.push({ item: "Freelancer named", ok: a.freelancer.trim().length > 0, detail: a.freelancer.trim() ? `The freelancer is ${a.freelancer}.` : "The freelancer is not named." });
  items.push({ item: "Client named", ok: a.client.trim().length > 0, detail: a.client.trim() ? `The client is ${a.client}.` : "The client is not named." });
  items.push({ item: "Scope of services written", ok: a.scope.trim().length > 0, detail: a.scope.trim() ? "The services section is written." : "There is no scope of services; what is being paid for is undefined." });
  items.push({ item: "Deliverables listed", ok: a.deliverables.length > 0, detail: a.deliverables.length ? `${a.deliverables.length} deliverable(s) listed.` : "No deliverables are listed; what the client receives at the end is undefined." });
  items.push({ item: "Rate set", ok: a.rate_cents > 0, detail: a.rate_cents > 0 ? `The rate is ${money(a.rate_cents, a.currency)} ${ratePhrase(a.rate_unit)}.` : "The rate is zero." });
  items.push({ item: "Payment terms written", ok: a.payment_terms.trim().length > 0, detail: a.payment_terms.trim() ? `Payment terms: ${a.payment_terms}.` : "No payment terms; when payment is due is undefined." });
  items.push({ item: "Start date set", ok: a.start_date !== null, detail: a.start_date ? `Work starts ${a.start_date}.` : "No start date; when the engagement begins is undefined." });
  items.push({
    item: "End date set", ok: a.end_date !== null,
    detail: a.end_date ? `The engagement ends ${a.end_date}.` : "No end date. As written the engagement is open-ended, and the termination clause is the only way either party leaves it.",
  });
  items.push({
    item: "Termination notice set", ok: a.termination_notice_days !== null,
    detail: a.termination_notice_days !== null
      ? `Either party may end the agreement with ${a.termination_notice_days} days' written notice.`
      : "No termination clause. As written, neither party has an agreed way to end the agreement.",
  });
  items.push({
    item: "Liability cap set", ok: a.liability_cap_cents !== null,
    detail: a.liability_cap_cents !== null
      ? `Total liability is capped at ${money(a.liability_cap_cents, a.currency)}.`
      : "No liability cap. As written, the freelancer's liability under the agreement is unlimited.",
  });
  items.push({
    item: "Jurisdiction set", ok: a.jurisdiction !== null,
    detail: a.jurisdiction ? `Governed by the law of ${a.jurisdiction}.` : "No jurisdiction. As written, which law governs the agreement and where a dispute would go is undecided.",
  });
  return items;
}

/* ------------------------------------------------------------------ rendering */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface ResolvedClause { clause: Clause; text: string }

function selectedClauses(a: Agreement): ResolvedClause[] {
  const vars = clauseVariables(a);
  const out: ResolvedClause[] = [];
  for (const id of a.clauses) {
    const clause = findClause(id);
    if (clause) out.push({ clause, text: substitute(clause.body, vars) });
  }
  return out;
}

function terminationLine(a: Agreement): string {
  const days = a.termination_notice_days === null ? "[add: termination notice days]" : String(a.termination_notice_days);
  return `Either party may end this agreement with ${days} days' written notice. The Client pays for all work done up to the notice taking effect.`;
}

function liabilityLine(a: Agreement): string {
  const cap = a.liability_cap_cents === null ? "[add: liability cap]" : money(a.liability_cap_cents, a.currency);
  return `The Freelancer's total liability arising out of this agreement is capped at ${cap}. Neither party is liable for indirect or consequential loss.`;
}

function jurisdictionLine(a: Agreement): string {
  const j = a.jurisdiction ?? "[add: jurisdiction]";
  return `This agreement is governed by the law of ${j}, and the parties submit to the exclusive jurisdiction of the courts of ${j}.`;
}

function termEndLine(a: Agreement): string {
  return a.end_date ?? "until the deliverables are accepted";
}

/** The whole agreement as clean Markdown, signature block and disclaimer included. */
export function renderMarkdown(a: Agreement): string {
  const vars = clauseVariables(a);
  const clauses = selectedClauses(a);
  const lines: string[] = [];
  lines.push(`# Service Agreement`);
  lines.push("");
  lines.push(`**Between:** ${a.freelancer} (the "Freelancer")${a.freelancer_address ? `, ${a.freelancer_address}` : ""}  `);
  lines.push(`**And:** ${a.client} (the "Client")${a.client_address ? `, ${a.client_address}` : ""}`);
  lines.push("");
  lines.push(`## 1. Services`);
  lines.push("");
  lines.push(`The Freelancer will provide the following services:`);
  lines.push("");
  lines.push(a.scope.trim() || "[add: scope of services]");
  lines.push("");
  lines.push(`## 2. Deliverables`);
  lines.push("");
  lines.push(`The Freelancer will deliver:`);
  lines.push("");
  if (a.deliverables.length) {
    for (const d of a.deliverables) lines.push(`- ${d}`);
  } else {
    lines.push(`- [add: deliverables]`);
  }
  lines.push("");
  lines.push(`## 3. Payment`);
  lines.push("");
  lines.push(`- **Rate:** ${vars.rate}`);
  lines.push(`- **Terms:** ${a.payment_terms.trim() || "[add: payment terms]"}`);
  lines.push("");
  lines.push(`## 4. Term`);
  lines.push("");
  lines.push(`This agreement starts ${a.start_date ?? "[add: start date]"} and runs ${termEndLine(a)}.`);
  lines.push("");
  lines.push(`## 5. Termination`);
  lines.push("");
  lines.push(terminationLine(a));
  lines.push("");
  lines.push(`## 6. Liability`);
  lines.push("");
  lines.push(liabilityLine(a));
  lines.push("");
  lines.push(`## 7. Jurisdiction`);
  lines.push("");
  lines.push(jurisdictionLine(a));
  if (clauses.length) {
    lines.push("");
    lines.push(`## 8. Additional clauses`);
    for (const { clause, text } of clauses) {
      lines.push("");
      lines.push(`### ${clause.title}`);
      lines.push("");
      lines.push(text);
    }
  }
  lines.push("");
  lines.push(`## Signatures`);
  lines.push("");
  lines.push(`| Freelancer | Client |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Signature: ______________________________ | Signature: ______________________________ |`);
  lines.push(`| Name: ${a.freelancer} | Name: ${a.client} |`);
  lines.push(`| Date: ______________ | Date: ______________ |`);
  lines.push("");
  lines.push(`---`);
  lines.push(DISCLAIMER);
  return lines.join("\n") + "\n";
}

/** The same agreement as self-contained HTML with print CSS; nothing external. */
export function renderHtml(a: Agreement): string {
  const vars = clauseVariables(a);
  const clauses = selectedClauses(a);
  const deliverables = a.deliverables.length
    ? `<ul>\n${a.deliverables.map((d) => `<li>${esc(d)}</li>`).join("\n")}\n</ul>`
    : `<p>[add: deliverables]</p>`;
  const clauseHtml = clauses.map(({ clause, text }) =>
    `<h3>${esc(clause.title)}</h3>\n<p>${esc(text)}</p>`,
  ).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Service Agreement - ${esc(a.freelancer)} and ${esc(a.client)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #111; max-width: 720px; margin: 2em auto; padding: 0 1em; line-height: 1.5; }
  h1 { font-size: 1.5em; text-align: center; border-bottom: 2px solid #111; padding-bottom: .4em; }
  h2 { font-size: 1.1em; margin-top: 1.6em; }
  h3 { font-size: 1em; margin-top: 1.2em; }
  .parties p { margin: .2em 0; }
  .sign { margin-top: 3em; display: flex; gap: 3em; }
  .sign div { flex: 1; }
  .sign .line { border-top: 1px solid #111; margin-top: 2.5em; padding-top: .3em; font-size: .9em; }
  .disclaimer { margin-top: 3em; border-top: 1px solid #999; padding-top: .8em; font-size: .85em; color: #444; }
  @media print { body { margin: 0; max-width: none; } .sign { page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>Service Agreement</h1>
<div class="parties">
<p><strong>Between:</strong> ${esc(a.freelancer)} (the "Freelancer")${a.freelancer_address ? `, ${esc(a.freelancer_address)}` : ""}</p>
<p><strong>And:</strong> ${esc(a.client)} (the "Client")${a.client_address ? `, ${esc(a.client_address)}` : ""}</p>
</div>
<h2>1. Services</h2>
<p>The Freelancer will provide the following services:</p>
<p>${esc(a.scope.trim() || "[add: scope of services]")}</p>
<h2>2. Deliverables</h2>
<p>The Freelancer will deliver:</p>
${deliverables}
<h2>3. Payment</h2>
<p><strong>Rate:</strong> ${esc(vars.rate)}<br>
<strong>Terms:</strong> ${esc(a.payment_terms.trim() || "[add: payment terms]")}</p>
<h2>4. Term</h2>
<p>This agreement starts ${esc(a.start_date ?? "[add: start date]")} and runs ${esc(termEndLine(a))}.</p>
<h2>5. Termination</h2>
<p>${esc(terminationLine(a))}</p>
<h2>6. Liability</h2>
<p>${esc(liabilityLine(a))}</p>
<h2>7. Jurisdiction</h2>
<p>${esc(jurisdictionLine(a))}</p>
${clauses.length ? `<h2>8. Additional clauses</h2>\n${clauseHtml}` : ""}
<h2>Signatures</h2>
<div class="sign">
<div>
<div class="line">Signature</div>
<div class="line">Name: ${esc(a.freelancer)}</div>
<div class="line">Date</div>
</div>
<div>
<div class="line">Signature</div>
<div class="line">Name: ${esc(a.client)}</div>
<div class="line">Date</div>
</div>
</div>
<p class="disclaimer">${esc(DISCLAIMER)}</p>
</body>
</html>
`;
}
