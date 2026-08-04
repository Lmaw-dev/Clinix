import os from 'node:os';

// ── AI medicine suggestions, run locally ─────────────────────────────────────
// Given the purpose of visit, chief complaint and the nurse's assessment, this
// asks a language model for medicines commonly appropriate — whether or not the
// clinic stocks them. The caller then marks which ones are actually on the shelf.
//
// The model runs on the clinic's own PC through Ollama. That is the whole point:
// no clinical text leaves the building, there is nothing to pay per request, and
// the feature keeps working when the internet does not. A hosted API would have
// meant sending patient complaints to a third party — on a free tier, one that
// trains on what it receives and lets humans read it.
//
// Two rules this module still enforces, unchanged from any other provider:
//
// 1. PRIVACY. Only clinical text is sent — complaint, assessment, purpose, and
//    optionally age/sex, which change what is appropriate. The patient's name,
//    ID, contact details and birthdate never reach the model, even though it is
//    running locally. Least data is a habit, not a concession to the network.
//
// 2. IT SUGGESTS, IT DOES NOT DECIDE. The reply is advisory text for the nurse
//    to accept or ignore. Nothing here dispenses medicine, writes a prescription
//    or touches inventory.

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'mistral';

// Local inference on a clinic PC is slow — tens of seconds is normal, and the
// model has to be loaded into memory on the first call after a restart.
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 180_000);

function ollamaUrl() {
  return (process.env.OLLAMA_URL || DEFAULT_URL).replace(/\/$/, '');
}

function modelName() {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

// Smallest model this feature will run on. See the check in aiStatus() for the
// measurement behind the number. Overridable for testing, but lowering it is a
// clinical decision, not a configuration one.
const MIN_PARAM_BILLIONS = Number(process.env.OLLAMA_MIN_PARAMS || 7);

/** "7.2B" / "1.2B" / "15.7B" -> 7.2 / 1.2 / 15.7. Null when Ollama reports nothing. */
function parseParamSize(text) {
  const m = /^([\d.]+)\s*B$/i.exec(String(text ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * The feature is on when Ollama is reachable AND the configured model is
 * actually pulled. Checking both matters: a running Ollama with no model gives
 * a confusing failure at the moment the nurse clicks Suggest, rather than a
 * clear "off" state on the screen.
 */
export async function aiStatus() {
  if (String(process.env.AI_SUGGESTIONS || '').toLowerCase() === 'false') {
    return { enabled: false, reason: 'Turned off in backend/.env (AI_SUGGESTIONS=false)' };
  }
  try {
    const res = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { enabled: false, reason: 'Ollama is not responding' };
    const body = await res.json();
    const installed = (body.models ?? []).map((m) => String(m.name ?? ''));
    const wanted = modelName();
    // Ollama reports "mistral:latest" for a model pulled as "mistral".
    const entry = (body.models ?? []).find(
      (m) => m.name === wanted || String(m.name).split(':')[0] === wanted.split(':')[0],
    );
    if (!entry) {
      return { enabled: false, reason: `Ollama is running but the "${wanted}" model is not installed. Run: ollama pull ${wanted}` };
    }

    // Refuse to run on a model too small to be trusted with this.
    //
    // This is not a guess. A 1.2B model was measured against four presentations:
    // it returned nothing for routine dysmenorrhea while flagging it for
    // referral, and — given a patient vomiting blood with rebound tenderness —
    // suggested four medicines including loperamide and set referralAdvised to
    // false. It inverted the one case where being wrong matters most.
    //
    // A nurse reading a confident, well-formatted, wrong answer is worse than
    // having no feature at all, so the size floor is enforced rather than
    // documented and hoped for.
    const params = parseParamSize(entry.details?.parameter_size);
    if (params !== null && params < MIN_PARAM_BILLIONS) {
      return {
        enabled: false,
        reason: `"${wanted}" is a ${entry.details.parameter_size} model — too small to be relied on for medicine suggestions. ` +
                `Use a ${MIN_PARAM_BILLIONS}B or larger model (e.g. mistral), which needs about 5 GB of free RAM.`,
      };
    }

    // A model that does not fit in memory does not fail — it swaps to disk and
    // answers so slowly that the request times out, which on screen is
    // indistinguishable from a hang. Measured: mistral (4.4 GB) on a machine
    // with 0.8 GB free produced nothing in four minutes. Warn before the nurse
    // clicks and waits, rather than after.
    const modelBytes = Number(entry.size ?? 0);
    const freeBytes = os.freemem();
    const warning = modelBytes && freeBytes < modelBytes * 1.15
      ? `Only ${(freeBytes / 1e9).toFixed(1)} GB of memory is free but "${wanted}" needs about ` +
        `${(modelBytes / 1e9).toFixed(1)} GB. Suggestions will be very slow or time out. ` +
        'Close other programs, or use a PC with more RAM.'
      : null;

    return {
      enabled: true,
      model: wanted,
      parameterSize: entry.details?.parameter_size ?? null,
      ...(warning ? { warning } : {}),
    };
  } catch {
    return { enabled: false, reason: 'Ollama is not running on this PC' };
  }
}

/** Older callers just want a boolean. */
export async function aiEnabled() {
  return (await aiStatus()).enabled;
}

// Structured output: the reply is parsed and rendered as a list, so it has to be
// data, not prose. Ollama constrains generation to this schema, which is what
// makes a small local model usable here at all — it cannot wander off into
// commentary when the grammar only permits these fields.
const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          genericName: { type: 'string' },
          drugClass: { type: 'string' },
          typicalDose: { type: 'string' },
          rationale: { type: 'string' },
          cautions: { type: 'string' },
        },
        required: ['genericName', 'drugClass', 'typicalDose', 'rationale', 'cautions'],
      },
    },
    redFlags: { type: 'array', items: { type: 'string' } },
    referralAdvised: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['suggestions', 'redFlags', 'referralAdvised', 'notes'],
};

const SYSTEM_PROMPT = `You support a licensed school clinic nurse at a Philippine university campus clinic. Given a patient's presenting complaint and the nurse's assessment, list medicines commonly appropriate for that presentation.

You are a reference, not the decision-maker. The nurse decides what is actually given, and knows the patient; you do not.

Rules:
- Use generic names with the strength, e.g. "Paracetamol 500mg". Never brand names.
- Stay within what a school clinic treats: minor pain, fever, colds, dysmenorrhea, mild allergy, superficial wounds, simple stomach complaints.
- Never suggest controlled substances, injectables, or anything needing a physician's prescription.
- Put anything in this presentation that needs a doctor rather than medicine into redFlags, and set referralAdvised to true when referral is the safe action. Returning no suggestions with a clear red flag is a correct answer.
- If the complaint is too vague to answer responsibly, return no suggestions and say what else to check in notes.
- Keep every field short. One sentence each.
- You are given clinical details only. There is no patient identity, and you must not ask for one.`;

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

  const status = await aiStatus();
  if (!status.enabled) {
    throw Object.assign(new Error(status.reason || 'Suggestions are unavailable'), { status: 503 });
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

  // Telling the model what the clinic actually stocks makes the reply usable:
  // it names medicines the way this clinic names them, so the match below finds
  // them instead of guessing at a synonym. It stays free to name something not
  // stocked — knowing what to buy is part of the answer.
  const stockLine = Array.isArray(input?.stockedNames) && input.stockedNames.length
    ? `\n\nThis clinic currently stocks: ${input.stockedNames.slice(0, 60).join(', ')}.\nPrefer these when clinically appropriate, using exactly these names. You may still name a medicine that is not stocked if it is the better answer.`
    : '';

  let body;
  try {
    const res = await fetch(`${ollamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: modelName(),
        stream: false,
        format: SUGGESTION_SCHEMA,
        options: {
          // Low temperature: this is a reference lookup, not creative writing.
          temperature: 0.2,
          num_predict: 900,
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + stockLine },
          { role: 'user', content: facts },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw Object.assign(
        new Error(`The local model returned an error${detail ? `: ${detail.slice(0, 200)}` : ''}`),
        { status: 502 },
      );
    }
    body = await res.json();
  } catch (error) {
    if (error.status) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw Object.assign(
        new Error('The local model took too long to answer. It may not have enough memory on this PC.'),
        { status: 504 },
      );
    }
    throw Object.assign(new Error('Could not reach the local model'), { status: 502 });
  }

  const text = body?.message?.content;
  if (!text) throw Object.assign(new Error('The model returned no suggestions'), { status: 502 });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Could not read the model's reply"), { status: 502 });
  }

  return {
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(normalizeSuggestion) : [],
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String) : [],
    referralAdvised: Boolean(parsed.referralAdvised),
    notes: String(parsed.notes ?? ''),
    model: modelName(),
  };
}

/** A smaller model can omit or mistype a field even under a schema; fill the gaps. */
function normalizeSuggestion(s) {
  const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
  return {
    genericName: str(s?.genericName),
    drugClass: str(s?.drugClass),
    typicalDose: str(s?.typicalDose),
    rationale: str(s?.rationale),
    cautions: str(s?.cautions),
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

  return suggestions
    .filter((s) => s.genericName)
    .map((s) => {
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
