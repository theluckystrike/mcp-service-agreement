#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLicenseGate, withFileLock } from "@theluckystrike/mcp-license";
import { z } from "zod";
import { VERSION } from "./version.js";
import {
  CLAUSES, DISCLAIMER, FLOW, MAX_CENTS, MAX_DELIVERABLES, MAX_NOTICE_DAYS, RATE_UNITS,
  checklist, clauseVariables, findClause, isActive, isIsoDate, money, nextStatus,
  normalizeStatus, ratePhrase, renderHtml, renderMarkdown, substitute, today,
  type Agreement, type RateUnit, type Status,
} from "./agreement.js";
import {
  dataDir, findAgreement, getAgreements, lockPath, nextId, resolveAgreement, setAgreements,
} from "./store.js";

/**
 * Free tier: THREE active agreements. An agreement is active until it is expired, so a
 * finished engagement that has run its course frees its slot. Reading, listing,
 * checklists and Markdown rendering are never metered: the agreement is the document
 * the work is done under, and a free tier that withholds the document is a demo. What
 * is metered is how many engagements are on the books at once, the clause library, and
 * the print-ready HTML.
 */
const FREE_ACTIVE_AGREEMENTS = 3;
const MAX_NAME = 200;
const MAX_TEXT = 4000;

const gate = createLicenseGate({ product: "service-agreement" });

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true as const });
const json = (v: unknown) => ok(JSON.stringify(v, null, 2));

const str = (field: string, max: number) => z.string().max(max, `${field} must be ${max} characters or fewer`);

/** Only this server's own store is written, so there is one lock and it is this one. */
function locked<T>(fn: () => T | Promise<T>): Promise<T> {
  return withFileLock(lockPath(), fn, { timeoutMs: 20000 });
}

function checkDate(value: string, field: string): string {
  if (!isIsoDate(value)) throw new Error(`cannot read a date: ${field} "${value}" is not a real date in YYYY-MM-DD form. Nothing was written.`);
  return value;
}

/* ------------------------------------------------------------- view helpers */

function agreementSummary(a: Agreement) {
  return {
    id: a.id, freelancer: a.freelancer, client: a.client, status: a.status,
    currency: a.currency, rate_cents: a.rate_cents, rate: `${money(a.rate_cents, a.currency)} ${ratePhrase(a.rate_unit)}`,
    start_date: a.start_date, end_date: a.end_date,
    deliverables: a.deliverables.length, clauses: a.clauses,
    updated: a.updated,
  };
}

function agreementDetail(a: Agreement) {
  return {
    ...agreementSummary(a),
    freelancer_address: a.freelancer_address ?? null,
    client_address: a.client_address ?? null,
    scope: a.scope,
    deliverable_list: a.deliverables,
    rate_unit: a.rate_unit,
    payment_terms: a.payment_terms,
    termination_notice_days: a.termination_notice_days,
    liability_cap_cents: a.liability_cap_cents,
    liability_cap: a.liability_cap_cents === null ? null : money(a.liability_cap_cents, a.currency),
    jurisdiction: a.jurisdiction,
    note: a.note ?? null,
    created: a.created,
    history: a.history,
  };
}

function freeTierNote(): string | null {
  if (gate.isPro()) return null;
  return `Free tier: ${getAgreements().filter(isActive).length} of ${FREE_ACTIVE_AGREEMENTS} active agreements.`;
}

const NO_LEGAL_ADVICE = DISCLAIMER;

/* ------------------------------------------------------------------- server */

const server = new McpServer(
  { name: "mcp-service-agreement", version: VERSION },
  { capabilities: { tools: {} } },
);

const agreementArg = str("agreement", MAX_NAME).describe("The agreement id, e.g. SA-2026-0003, or the client name when only one agreement has it");

server.registerTool("agreement_create", {
  title: "Write a service agreement",
  description: "Write a service agreement between a freelancer and a client before the work starts: the parties, the scope of services, the deliverables, the rate and payment terms, start and end dates, a termination notice period, a liability cap and the governing jurisdiction. Stores the agreement and returns it rendered as clean Markdown with a signature block. Free tier: 3 active agreements; expiring a finished one frees its slot.",
  inputSchema: {
    freelancer: str("freelancer", MAX_NAME).describe("Who does the work, e.g. Anna Nowak, or Nowak Design"),
    client: str("client", MAX_NAME).describe("Who the work is for, e.g. Brightleaf Studio"),
    scope: str("scope", MAX_TEXT).describe("The services the freelancer provides, e.g. Design and build of a five-page marketing site, with two weeks of post-launch fixes"),
    deliverables: z.array(str("deliverable", 400)).min(1, "list at least one deliverable").max(MAX_DELIVERABLES).describe("What the client receives at the end, e.g. [\"Five-page site deployed to the client's host\", \"Handover document\"]"),
    rate_cents: z.number().int().min(0).max(MAX_CENTS).describe("The rate in whole cents. 8500 is 85.00"),
    rate_unit: z.enum(RATE_UNITS as [RateUnit, ...RateUnit[]]).describe("What the rate buys: an hour, a day, or the whole project"),
    currency: z.string().regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO code such as EUR").describe("ISO code the rate and cap are in"),
    payment_terms: str("payment_terms", 500).describe("When and how it is paid, e.g. Net 14 from invoice date, or 50% on signing and 50% on delivery"),
    start_date: str("start_date", 10).optional().describe("The date work begins, YYYY-MM-DD. May be in the future; it is a plan, not a log"),
    end_date: str("end_date", 10).optional().describe("The date the engagement ends, YYYY-MM-DD. Leave unset for an open-ended engagement"),
    termination_notice_days: z.number().int().min(0).max(MAX_NOTICE_DAYS).optional().describe("Days of written notice either party must give to end the agreement, e.g. 14"),
    liability_cap_cents: z.number().int().min(0).max(MAX_CENTS).optional().describe("The most the freelancer can be liable for, in whole cents. Leave unset and liability is uncapped, which the checklist flags"),
    jurisdiction: str("jurisdiction", 300).optional().describe("The governing law and courts, e.g. England and Wales, or the State of New York"),
    clauses: z.array(str("clause", 40)).max(20).optional().describe(`Ids of library clauses to include, from clause_library: ${CLAUSES.map((c) => c.id).join(", ")}. The clause library is a Pro feature`),
    freelancer_address: str("freelancer_address", 400).optional(),
    client_address: str("client_address", 400).optional(),
    note: str("note", MAX_TEXT).optional(),
  },
}, async (a) => {
  try {
    const start = a.start_date ? checkDate(a.start_date, "start_date") : null;
    const end = a.end_date ? checkDate(a.end_date, "end_date") : null;
    if (start && end && end < start) throw new Error(`the end date ${end} is before the start date ${start}. Nothing was written.`);
    const clauseIds = (a.clauses ?? []).map((c) => c.trim().toLowerCase());
    for (const id of clauseIds) {
      if (!findClause(id)) throw new Error(`"${id}" is not a clause in the library. clause_library lists them: ${CLAUSES.map((c) => c.id).join(", ")}. Nothing was written.`);
    }
    if (clauseIds.length && !gate.isPro()) {
      throw new Error(`this agreement names ${clauseIds.length} library clause(s) (${clauseIds.join(", ")}), and the clause library is a Pro feature. The core template -- parties, services, deliverables, payment, term, termination, liability, jurisdiction and signatures -- is fully free. Nothing was written. ` + gate.upgradeText("the full clause library", "agreement_create"));
    }
    const rec = await locked(() => {
      const list = getAgreements();
      if (!gate.isPro()) {
        const active = list.filter(isActive);
        if (active.length >= FREE_ACTIVE_AGREEMENTS) {
          throw new Error(
            `the free tier holds ${FREE_ACTIVE_AGREEMENTS} active agreements and there are already ${active.length} (${active.map((x) => `${x.id} ${x.client}`).join(", ")}). ` +
            `Expiring a finished engagement frees its slot, and reading, listing, checklists and Markdown rendering stay free. Nothing was written. ` +
            gate.upgradeText("unlimited agreements", "agreement_create"),
          );
        }
      }
      const now = new Date().toISOString();
      const id = nextId(now.slice(0, 4), list.map((x) => x.id));
      const ag: Agreement = {
        id, freelancer: a.freelancer.trim(), client: a.client.trim(),
        freelancer_address: a.freelancer_address ?? null, client_address: a.client_address ?? null,
        scope: a.scope.trim(), deliverables: a.deliverables.map((d) => d.trim()),
        rate_cents: a.rate_cents, rate_unit: a.rate_unit, currency: a.currency.toUpperCase(),
        payment_terms: a.payment_terms.trim(),
        start_date: start, end_date: end,
        termination_notice_days: a.termination_notice_days ?? null,
        liability_cap_cents: a.liability_cap_cents ?? null,
        jurisdiction: a.jurisdiction?.trim() || null,
        clauses: clauseIds,
        status: "draft", history: [],
        note: a.note, created: now, updated: now,
      };
      list.push(ag);
      setAgreements(list);
      return ag;
    });
    const notes: string[] = [];
    const free = freeTierNote();
    if (free) notes.push(free);
    notes.push(`Run agreement_checklist on ${rec.id} before sending it: it lists missing fields and flags one-sided gaps.`);
    return json({
      created: agreementDetail(rec),
      markdown: renderMarkdown(rec),
      next: `Review the Markdown, then move the agreement along with agreement_update_status: ${FLOW.join(" to ")}. agreement_render gives Markdown or, on Pro, print-ready HTML.`,
      notes, disclaimer: NO_LEGAL_ADVICE,
    });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("agreement_get", {
  title: "Read one agreement",
  description: "Read one service agreement in full by SA number or client name: parties, scope, deliverables, rate and payment terms, dates, termination, liability cap, jurisdiction, the clauses it carries, its status and its status history. Reads only.",
  inputSchema: {
    agreement: agreementArg,
  },
}, async (a) => {
  try {
    const list = getAgreements();
    const ag = findAgreement(list, a.agreement);
    if (!ag) throw new Error(`no agreement matches "${a.agreement}". Known: ${list.map((x) => `${x.id} (${x.client})`).join(", ") || "none"}.`);
    return json({ ...agreementDetail(ag), disclaimer: NO_LEGAL_ADVICE });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("agreement_list", {
  title: "List agreements",
  description: "List service agreements newest first: parties, status, rate, dates and the clauses each carries. Filter by status and by client. An agreement is active until it is expired; the free tier holds 3 active agreements.",
  inputSchema: {
    status: str("status", 20).optional().describe(`Only agreements at this status: ${FLOW.join(", ")}`),
    client: str("client", MAX_NAME).optional().describe("Only agreements whose client contains this text, case-insensitive"),
  },
}, async (a) => {
  try {
    let status: Status | null = null;
    if (a.status !== undefined) {
      status = normalizeStatus(a.status);
      if (!status) throw new Error(`"${a.status}" is not a status an agreement has. The flow is ${FLOW.join(", ")}.`);
    }
    let list = getAgreements();
    if (status) list = list.filter((x) => x.status === status);
    if (a.client) {
      const needle = a.client.trim().toLowerCase();
      list = list.filter((x) => x.client.toLowerCase().includes(needle));
    }
    list = [...list].sort((x, y) => (x.created === y.created ? y.id.localeCompare(x.id) : x.created < y.created ? 1 : -1));
    const notes: string[] = [];
    const free = freeTierNote();
    if (free) notes.push(free);
    return json({
      count: list.length,
      active: getAgreements().filter(isActive).length,
      agreements: list.map(agreementSummary),
      notes, disclaimer: NO_LEGAL_ADVICE,
    });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("agreement_update_status", {
  title: "Move an agreement one step",
  description: "Move one agreement exactly one step: draft, sent, signed, expired, stamping the date and an optional note into its history. A skipped or backwards step is refused and nothing is written. Expiring a finished engagement frees a free-tier slot.",
  inputSchema: {
    agreement: agreementArg,
    status: str("status", 20).describe(`The next step for this agreement: ${FLOW.join(", ")}`),
    date: str("date", 10).optional().describe("The date to stamp the step with, YYYY-MM-DD. Default today"),
    note: str("note", MAX_TEXT).optional(),
  },
}, async (a) => {
  try {
    const date = a.date ? checkDate(a.date, "date") : today();
    const target = normalizeStatus(a.status);
    if (!target) throw new Error(`"${a.status}" is not a status an agreement has. The flow is ${FLOW.join(", ")}. Nothing was written.`);
    const out = await locked(() => {
      const list = getAgreements();
      const ag = resolveAgreement(list, a.agreement);
      const want = nextStatus(ag.status);
      if (target === ag.status) throw new Error(`${ag.id} is already ${ag.status}. Nothing was written.`);
      if (target !== want) {
        throw new Error(
          want === null
            ? `${ag.id} is expired, the end of the flow, and cannot move. Nothing was written.`
            : `${ag.id} is ${ag.status} and an agreement moves exactly one step at a time, so the only step from here is ${want}. ` +
              `Asked for ${target}. The flow is ${FLOW.join(" to ")}. Nothing was written.`,
        );
      }
      const last = ag.history[ag.history.length - 1];
      if (last && date < last.date) {
        throw new Error(`the last step on ${ag.id} is stamped ${last.date} and this one is dated ${date}. A step cannot be dated before the step before it. Nothing was written.`);
      }
      ag.history.push({ status: target, date, note: a.note, at: new Date().toISOString() });
      ag.status = target;
      ag.updated = new Date().toISOString();
      setAgreements(list);
      return ag;
    });
    const notes: string[] = [];
    if (out.status === "sent") notes.push("The agreement is with the client. Any change to the terms now means a new draft: create it fresh so the signed record stays intact.");
    if (out.status === "expired") notes.push("The agreement is expired and no longer counts against the free tier. Its record is kept.");
    return json({ agreement: agreementSummary(out), history: out.history, notes, disclaimer: NO_LEGAL_ADVICE });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("clause_library", {
  title: "List the built-in clause library",
  description: "List the built-in clause library: intellectual property assignment, mutual confidentiality, late payment interest, kill fee and revision rounds. Each clause is a title plus a body text. Pass an agreement and, on Pro, every body comes back with that agreement's variables filled in. The free tier lists titles and summaries; the full texts are a Pro feature.",
  inputSchema: {
    agreement: agreementArg.optional().describe("Fill each clause body with this agreement's variables. Pro feature"),
  },
}, async (a) => {
  try {
    const pro = gate.isPro();
    let ag: Agreement | null = null;
    if (a.agreement !== undefined) {
      const list = getAgreements();
      ag = findAgreement(list, a.agreement) ?? null;
      if (!ag) throw new Error(`no agreement matches "${a.agreement}". Known: ${list.map((x) => `${x.id} (${x.client})`).join(", ") || "none"}.`);
    }
    if (!pro) {
      return json({
        pro: false,
        clauses: CLAUSES.map((c) => ({ id: c.id, title: c.title, summary: c.summary })),
        note: "Titles and summaries are free; the full clause texts, filled with your agreement's variables, are a Pro feature.",
        upgrade: gate.upgradeText("the full clause library", "clause_library"),
        disclaimer: NO_LEGAL_ADVICE,
      });
    }
    const vars = ag ? clauseVariables(ag) : null;
    return json({
      pro: true,
      agreement: ag ? ag.id : null,
      clauses: CLAUSES.map((c) => ({
        id: c.id, title: c.title, summary: c.summary,
        body: vars ? substitute(c.body, vars) : c.body,
        variables_filled: vars !== null,
      })),
      note: ag
        ? `Bodies are filled with ${ag.id}'s variables. Include any of them on the agreement with agreement_create's clauses argument, or add the text yourself.`
        : "Bodies carry {{variables}}. Pass an agreement id or client name to see them filled.",
      disclaimer: NO_LEGAL_ADVICE,
    });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("agreement_render", {
  title: "Render an agreement for signing",
  description: "Render a service agreement ready to send and sign: the parties, the services, the deliverables, the payment terms, the term, termination, liability, jurisdiction, any library clauses it carries, and a signature block for both parties. Markdown, or self-contained HTML with print CSS that needs nothing from the network. HTML is a Pro feature. Writes nothing.",
  inputSchema: {
    agreement: agreementArg,
    format: z.enum(["markdown", "html"]).optional().describe("markdown (default) or html. The HTML carries its own styling and references nothing external. HTML is a Pro feature"),
  },
}, async (a) => {
  try {
    const list = getAgreements();
    const ag = findAgreement(list, a.agreement);
    if (!ag) throw new Error(`no agreement matches "${a.agreement}". Known: ${list.map((x) => `${x.id} (${x.client})`).join(", ") || "none"}.`);
    const format = a.format ?? "markdown";
    if (format === "html" && !gate.isPro()) {
      throw new Error(`HTML rendering is a Pro feature; Markdown rendering is fully free. Nothing was written. ` + gate.upgradeText("HTML rendering", "agreement_render"));
    }
    return ok(format === "html" ? renderHtml(ag) : renderMarkdown(ag));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("agreement_checklist", {
  title: "Check an agreement before you send it",
  description: "The before-you-send-it checklist for one agreement: every missing field is listed, and terms whose absence cuts one way are flagged neutrally -- as written, what the gap means for both parties -- such as no termination clause or an uncapped liability. Reads only.",
  inputSchema: {
    agreement: agreementArg,
  },
}, async (a) => {
  try {
    const list = getAgreements();
    const ag = findAgreement(list, a.agreement);
    if (!ag) throw new Error(`no agreement matches "${a.agreement}". Known: ${list.map((x) => `${x.id} (${x.client})`).join(", ") || "none"}.`);
    const items = checklist(ag);
    const missing = items.filter((i) => !i.ok);
    const notes: string[] = [];
    if (ag.status !== "draft") notes.push(`${ag.id} is ${ag.status}, not draft. This checklist is for before you send it; re-reading it now is a review of what was signed, not a gate.`);
    if (ag.clauses.length === 0) notes.push("No library clauses are attached. clause_library lists the five built-ins: intellectual property assignment, mutual confidentiality, late payment interest, kill fee, revision rounds.");
    return json({
      agreement: ag.id,
      client: ag.client,
      status: ag.status,
      ready: missing.length === 0,
      missing_count: missing.length,
      items,
      notes,
      disclaimer: NO_LEGAL_ADVICE,
    });
  } catch (e) { return fail((e as Error).message); }
});

gate.registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`mcp-service-agreement ${VERSION} ready; store at ${dataDir()}\n`);
