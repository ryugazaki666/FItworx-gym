// server/services/ai.js
//
// AI-Integrated Natural Language Reporting.
//
// Design goal: the model must NEVER invent figures. It is only given a
// fixed set of "tools" that each map 1:1 to a read-only function in
// reportData.js, which queries the real SQLite database. The model can
// call one or more tools, we execute them against the real database, feed
// the actual results back to the model, and only then does it compose a
// natural-language answer. The final HTTP response also returns the raw
// tool results so the UI can show the user exactly what data backed the
// answer (for verifiability).
import { GoogleGenAI } from "@google/genai";
import * as reportData from "./reportData.js";

// As of mid-2026 Google's older, per-model "generateContent" endpoint is being phased out for
// new API keys in favor of the Interactions API, which is model-agnostic and manages multi-turn
// / tool-calling state for you server-side (see the previous_interaction_id usage below).
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your .env file to enable AI-integrated natural language reporting."
    );
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Tool name -> { description, input_schema, run(input) }
const TOOLS = {
  get_membership_summary: {
    description: "Get counts of members by status (active/expiring/expired/suspended/pending), by plan, and how many joined this month.",
    input_schema: { type: "object", properties: {} },
    run: () => reportData.getMembershipSummary(),
  },
  get_expiring_memberships: {
    description: "List members whose membership is expiring or has expired within a given number of days from today.",
    input_schema: {
      type: "object",
      properties: { withinDays: { type: "number", description: "Look-ahead window in days. Default 7." } },
    },
    run: ({ withinDays } = {}) => reportData.getExpiringMemberships(withinDays ?? 7),
  },
  search_members: {
    description: "Search registered members by name, email, phone, or member ID, and/or filter by status or plan name.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search on name, email, phone, or member ID." },
        status: { type: "string", enum: ["active", "expiring", "expired", "suspended", "pending"] },
        plan: { type: "string", description: "Exact plan name, e.g. Monthly, Annual." },
        limit: { type: "number" },
      },
    },
    run: (input) => reportData.searchMembers(input || {}),
  },
  get_member_details: {
    description: "Get full profile, recent payments, and attendance stats for a single member by their Member ID (e.g. MEM-0001).",
    input_schema: {
      type: "object",
      properties: { memberId: { type: "string" } },
      required: ["memberId"],
    },
    run: ({ memberId }) => reportData.getMemberDetails(memberId),
  },
  get_revenue_summary: {
    description: "Get total revenue, transaction counts, breakdown by transaction type and payment method, and pending amounts for a period.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month", "year", "all"] } },
    },
    run: ({ period } = {}) => reportData.getRevenueSummary(period ?? "month"),
  },
  get_payment_history: {
    description: "List individual payment/transaction records, optionally filtered by member ID, walk-in ID, payment method, or status.",
    input_schema: {
      type: "object",
      properties: {
        memberId: { type: "string" },
        walkinId: { type: "string" },
        method: { type: "string" },
        status: { type: "string", enum: ["paid", "pending", "failed"] },
        limit: { type: "number" },
      },
    },
    run: (input) => reportData.getPaymentHistory(input || {}),
  },
  get_attendance_summary: {
    description: "Get attendance/visit statistics for a period: total visits, unique members, currently checked-in count, per-day breakdown, and most frequent visitors.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month", "year", "all"] } },
    },
    run: ({ period } = {}) => reportData.getAttendanceSummary(period ?? "week"),
  },
  get_walkin_summary: {
    description: "Get walk-in / non-member customer totals and revenue for a period, broken down by service type.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month", "year", "all"] } },
    },
    run: ({ period } = {}) => reportData.getWalkinSummary(period ?? "month"),
  },
};

// The Interactions API takes tool declarations as a flat array, each tagged type: "function",
// and accepts plain JSON Schema for `parameters` directly — unlike the older generateContent
// API, no SDK-specific type-constant conversion is needed here.
const tools = Object.entries(TOOLS).map(([name, t]) => ({
  type: "function",
  name,
  description: t.description,
  parameters: t.input_schema,
}));

const SYSTEM_PROMPT = `You are the reporting assistant built into FitWorx, a gym management system. You answer staff/admin questions about the gym's actual records: members, walk-in customers, payments, revenue, and attendance.

Rules you must always follow:
1. You must call one or more of the provided tools to retrieve real data before answering any question that involves numbers, records, names, or dates. Never answer from memory or assumption.
2. Never invent, estimate, or round in a way that misrepresents figures that came from a tool. Only state numbers that came directly from a tool result.
3. If the available tools cannot answer the question (e.g. it asks about something outside gym records), say so plainly instead of guessing.
4. If a tool returns zero results, say there is no matching data rather than making something up.
5. Keep answers concise, factual, and in plain business language suitable for a gym front-desk or admin user. Use short paragraphs or bullet points for lists.
6. Distinguish clearly between registered members and walk-in/non-member customers when both appear in the data.
7. Today's date is ${new Date().toISOString().slice(0, 10)}.`;

export async function answerQuery(question, { maxRounds = 4 } = {}) {
  const ai = getClient();
  const toolTrace = [];

  // The Interactions API tracks conversation + tool-call state server-side, so each round just
  // chains off the previous interaction's id instead of us resending the full transcript.
  let interaction = await ai.interactions.create({
    model: MODEL,
    input: question,
    system_instruction: SYSTEM_PROMPT,
    tools,
  });

  for (let round = 0; round < maxRounds; round++) {
    const functionCalls = (interaction.steps || []).filter((s) => s.type === "function_call");

    if (functionCalls.length === 0) {
      const text = (interaction.output_text || "").trim();
      return {
        answer: text || "I couldn't generate an answer from the available data.",
        toolTrace,
      };
    }

    const results = [];
    for (const call of functionCalls) {
      const tool = TOOLS[call.name];
      let resultPayload;
      try {
        resultPayload = tool ? tool.run(call.arguments) : { error: `Unknown tool: ${call.name}` };
      } catch (error) {
        resultPayload = { error: error.message };
      }
      toolTrace.push({ tool: call.name, input: call.arguments, result: resultPayload });
      results.push({
        type: "function_result",
        name: call.name,
        call_id: call.id,
        result: [{ type: "text", text: JSON.stringify(resultPayload) }],
      });
    }

    interaction = await ai.interactions.create({
      model: MODEL,
      input: results,
      tools,
      previous_interaction_id: interaction.id,
    });
  }

  return {
    answer: "The query required more data lookups than allowed. Please ask a more specific question.",
    toolTrace,
  };
}
