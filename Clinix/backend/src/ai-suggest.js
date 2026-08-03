import Anthropic from '@anthropic-ai/sdk';

// ── AI medicine suggestions (clinical decision support) ──────────────────────
// Given the purpose of visit, chief complaint and the nurse's assessment, this
// asks Claude for medicines that are commonly appropriate — whether or not the
// clinic stocks them. The caller then marks which ones are actually on the
// shelf.
//
// Two rules this module exists to enforce:
//
// 1. PRIVACY. Only the clinical text is sent — complaint, assessment, purpose,
//    and optionally age/sex, which change what is appropriate. The patient's
//    name, student ID, contact details and birthdate never leave this server.
//    Medical information is personal data under the Data Privacy Act (RA 10173),
//    so the request carries the least that still makes the answer useful.
//
// 2. IT SUGGESTS, IT DOES NOT DECIDE. The reply is advisory text for the nurse
//    to accept or ignore. Nothing here dispenses medicine, writes to the
//    prescription table, or touches inventory — a suggestion only becomes real
//    when a person acts on it.

const MODEL = 'claude-opus-5';

/** The feature is optional: without a key the endpoint reports itself disabled. */
export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Structured output: the reply is parsed and rendered as a list, so it has to be
// data, not prose. Every object is closed (`additionalProperties: false`) so a
// stray field can never reach the UI.
const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          genericName: { type: 'string', description: 'Generic drug name, e.g. "Paracetamol 500mg"' },
          drugClass: { type: 'string', description: 'Short class, e.g. "Analgesic / antipyretic"' },
          typicalDose: { type: 'string', description: 'Usual adult dose and frequency for a school clinic' },
          rationale: { type: 'string', description: 'One sentence on why it fits this complaint' },
          cautions: { type: 'string', description: 'Key contraindications or warnings; empty string if none notable' },
        },
        required: ['genericName', 'drugClass', 'typicalDose', 'rationale', 'cautions'],
        additionalProperties: false,
      },
    },
    redFlags: {
      type: 'array',
      description: 'Warning signs in this presentation that need a doctor, not medicine.',
      items: { type: 'string' },
    },
    referralAdvised: {
      type: 'boolean',
      description: 'True when this should be referred rather than treated at the clinic.',
    },
    notes: { type: 'string', description: 'Brief context for the nurse; empty string if none.' },
  },
  required: ['suggestions', 'redFlags', 'referralAdvised', 'notes'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You support a licensed school clinic nurse at a Philippine university campus clinic. Given a patient's presenting complaint and the nurse's own assessment, list medicines commonly appropriate for that presentation.

You are a reference, not the decision-maker. The nurse decides what is actually given, and knows the patient; you do not. Write as you would in a formulary note for a colleague.

- Suggest generic names with the strength, not brand names.
- Stay within what a school clinic treats: minor pain, fever, colds, dysmenorrhea, mild allergy, superficial wounds, simple GI complaints.
- Do not suggest controlled substances, injectables, or anything needing a physician's prescription or monitoring.
- Put anything in this presentation that warrants a doctor rather than medicine in redFlags, and set referralAdvised when the safe action is referral rather than treatment. An empty suggestions list with a clear red flag is a correct and useful answer.
- If the complaint is too vague to suggest anything responsibly, return no suggestions and say what else the nurse should check in notes.
- You are given only clinical details. There is no patient identity to consider, and you must not ask for one.`;

/**
 * Ask for medicine suggestions.
 * `input` carries clinical text only — the caller is responsible for not
 * passing anything that identifies the patient.
 */
export async function suggestMedicines(input) {
  const complaint = String(input?.chiefComplaint ?? '').trim();
  const assessment = String(input?.assessment ?? '').trim();
  if (!complaint && !assessment) {
    throw Object.assign(new Error('A chief complaint or an assessment is required'), { status: 400 });
  }

  // Deliberately narrow: only what changes the clinical answer.
  const facts = [
    input?.purpose ? `Purpose of visit: ${String(input.purpose).trim()}` : null,
    complaint ? `Chief complaint: ${complaint}` : null,
    assessment ? `Nurse's assessment: ${assessment}` : null,
    input?.age ? `Age: ${String(input.age).trim()}` : null,
    input?.sex ? `Sex: ${String(input.sex).trim()}` : null,
    input?.vitals ? `Vital signs: ${String(input.vitals).trim()}` : null,
  ].filter(Boolean).join('\n');

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // A refusal on a benign clinical question is unlikely but possible; the
    // fallback re-runs it on another model inside the same call rather than
    // leaving the nurse with an error.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: SUGGESTION_SCHEMA },
      effort: 'medium',
    },
    messages: [{ role: 'user', content: facts }],
  });

  // Always check why generation stopped before reading content — a refusal
  // returns HTTP 200 with no usable text, and indexing content[0] would throw.
  if (response.stop_reason === 'refusal') {
    throw Object.assign(
      new Error('The assistant declined to answer this one. Please decide clinically without it.'),
      { status: 422 },
    );
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) {
    throw Object.assign(new Error('The assistant returned no suggestions'), { status: 502 });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Could not read the assistant\'s reply'), { status: 502 });
  }

  return {
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    referralAdvised: Boolean(parsed.referralAdvised),
    notes: String(parsed.notes ?? ''),
  };
}

/**
 * Match each suggestion against the clinic's stock so the nurse can see at a
 * glance what can be dispensed now and what has to be bought or substituted.
 * Matching is by name because the model does not know the clinic's item codes.
 */
export function matchAgainstInventory(suggestions, inventoryRows) {
  const stock = inventoryRows
    .filter((i) => !i.archived && Number(i.qty ?? 0) > 0)
    .map((i) => ({ code: i.code, name: String(i.name ?? ''), qty: Number(i.qty ?? 0), unit: i.unit || '' }));

  return suggestions.map((s) => {
    const wanted = normalize(s.genericName);
    // A drug name is "Paracetamol 500mg (Biogesic)" in one place and
    // "Paracetamol 500 mg" in another, so compare on significant words rather
    // than the whole string.
    const match = stock.find((item) => {
      const have = normalize(item.name);
      return have.includes(wanted) || wanted.includes(have) || sharesKeyWord(have, wanted);
    });
    return {
      ...s,
      inStock: Boolean(match),
      itemCode: match?.code ?? null,
      itemName: match?.name ?? null,
      available: match ? match.qty : 0,
      unit: match?.unit ?? '',
    };
  });
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when both names share a word long enough to be a drug name, not "mg" or "tablet". */
function sharesKeyWord(a, b) {
  const NOISE = new Set(['tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'suspension', 'mg', 'ml', 'oral']);
  const words = (s) => new Set(s.split(/[^a-z]+/).filter((w) => w.length >= 5 && !NOISE.has(w)));
  const wa = words(a);
  for (const w of words(b)) if (wa.has(w)) return true;
  return false;
}
