// ── Learned medicine suggestions ─────────────────────────────────────────────
// A small classifier trained on this clinic's own records: what was written as
// the chief complaint, and what medicine was actually handed over. It answers
// one question — "for a complaint like this, what does THIS clinic give?" — and
// nothing else.
//
// Why this rather than a language model. A 3B model needs 2 GB of RAM, takes
// tens of seconds, and has no idea what this clinic stocks or prescribes; it
// guesses from what it read on the internet. This is roughly 50 KB of counts,
// answers in under a millisecond, runs anywhere, and every association in it
// came from a licensed nurse's own decision. It is also inspectable: you can
// ask it which words drove a suggestion and get a straight answer.
//
// What it is NOT: it has no clinical knowledge. It cannot reason, and it does
// not know that vomiting blood is an emergency unless someone recorded that.
// It is a memory of practice, not a clinician. The two things that follow from
// that are load-bearing:
//
//   1. It stays silent when it has not seen the words before. No token overlap,
//      no answer. A wrong-but-confident suggestion is the failure mode that
//      matters here, so the design refuses to guess.
//   2. It never supplies a dose. Doses come from the nurse or the formulary.
//
// The model is Naive Bayes over complaint words. That is a deliberate choice:
// with the tens-to-hundreds of examples a clinic accumulates, it beats anything
// heavier, trains in milliseconds, and can be explained to a panel in one
// sentence.

import { pool } from './db.js';
import { decrypt } from './crypto.js';

// Words that carry no signal about which medicine to give. Kept short on
// purpose — over-filtering throws away the vocabulary the clinic actually uses.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'has', 'had', 'have', 'was', 'were',
  'since', 'from', 'after', 'before', 'about', 'complains', 'complaining', 'patient',
  'reports', 'reported', 'noted', 'states', 'per', 'due', 'her', 'his', 'she', 'him',
  'not', 'non', 'any', 'all', 'also', 'still', 'today', 'yesterday', 'morning',
  'night', 'day', 'days', 'week', 'weeks', 'ago', 'consult', 'consultation',
]);

/** Complaint text -> the words the model actually learns from. */
export function tokenize(text) {
  return [...new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  )];
}

/**
 * Pull every (complaint -> medicine) pair the clinic has produced.
 *
 * Two sources, and the distinction matters:
 *   - formulary: what the nurse says should be given. Deliberate, and worth
 *     more than a single visit, so it is weighted higher.
 *   - prescriptions joined to their consultation: what was actually given.
 *     This is the part that grows on its own as the clinic is used.
 */
export async function loadTrainingPairs() {
  const pairs = [];

  const [formulary] = await pool.query(
    'SELECT complaint, item_code, item_name FROM formulary WHERE item_code IS NOT NULL',
  );
  for (const row of formulary) {
    const complaint = decrypt(row.complaint);
    if (complaint && row.item_code) {
      // Weight 3: a formulary entry is a standing decision, not one visit.
      pairs.push({ complaint, itemCode: row.item_code, itemName: decrypt(row.item_name), weight: 3, source: 'formulary' });
    }
  }

  const [dispensed] = await pool.query(`
    SELECT c.chief_complaint, c.reason, p.item_code, p.item_name
    FROM prescriptions p
    JOIN consultations c ON c.id = p.consultation_id
    WHERE p.item_code IS NOT NULL
  `);
  for (const row of dispensed) {
    const complaint = decrypt(row.chief_complaint) || decrypt(row.reason);
    if (complaint && row.item_code) {
      pairs.push({ complaint, itemCode: row.item_code, itemName: decrypt(row.item_name), weight: 1, source: 'dispensed' });
    }
  }

  return pairs;
}

/**
 * Count words per medicine. This is the whole of "training" — one pass, no
 * iteration, no tuning. On a few hundred pairs it takes single-digit
 * milliseconds, which is why the model is rebuilt per request instead of being
 * cached and left to go stale.
 */
export function train(pairs) {
  const items = new Map();   // itemCode -> { name, total, docs, counts: Map<word, weight> }
  const vocabulary = new Set();
  let totalDocs = 0;

  for (const { complaint, itemCode, itemName, weight } of pairs) {
    const words = tokenize(complaint);
    if (!words.length) continue;

    if (!items.has(itemCode)) {
      items.set(itemCode, { name: itemName || itemCode, total: 0, docs: 0, counts: new Map() });
    }
    const item = items.get(itemCode);
    item.docs += weight;
    totalDocs += weight;

    for (const word of words) {
      vocabulary.add(word);
      item.counts.set(word, (item.counts.get(word) ?? 0) + weight);
      item.total += weight;
    }
  }

  return { items, vocabulary, totalDocs, exampleCount: pairs.length };
}

/**
 * Score a complaint against the model.
 *
 * Returns [] when no word in the complaint appears anywhere in the training
 * data. That silence is the point: a model that has never seen "epistaxis"
 * must not rank medicines by prior frequency and hand back paracetamol.
 */
export function predict(model, complaint, { limit = 3, minMatchedWords = 1 } = {}) {
  const words = tokenize(complaint);
  if (!words.length || !model.totalDocs) return [];

  const known = words.filter((w) => model.vocabulary.has(w));
  if (known.length < minMatchedWords) return [];

  const V = model.vocabulary.size;
  const scored = [];

  for (const [code, item] of model.items) {
    // Log space: probabilities multiply, and a dozen small factors underflow.
    let score = Math.log(item.docs / model.totalDocs);
    let matched = [];
    for (const word of known) {
      const count = item.counts.get(word) ?? 0;
      // Laplace smoothing keeps an unseen word from zeroing the whole product.
      score += Math.log((count + 1) / (item.total + V));
      if (count > 0) matched.push(word);
    }
    // An item that shares no word with this complaint is not a candidate,
    // however common it is. Without this the most-dispensed medicine wins
    // every unfamiliar complaint on its prior alone.
    if (!matched.length) continue;
    scored.push({ itemCode: code, itemName: item.name, score, matchedWords: matched, examples: item.docs });
  }

  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);

  // Turn log-odds into something a person can read. Softmax over the
  // candidates, so it reflects how clearly this one leads the others rather
  // than pretending to be a probability of clinical correctness.
  const top = scored.slice(0, limit);
  const max = top[0].score;
  const exps = top.map((s) => Math.exp(s.score - max));
  const sum = exps.reduce((a, b) => a + b, 0);

  return top.map((s, i) => ({
    itemCode: s.itemCode,
    itemName: s.itemName,
    confidence: exps[i] / sum,
    matchedWords: s.matchedWords,
    // How many recorded decisions stand behind this. A suggestion backed by two
    // examples deserves less trust than one backed by forty, and the nurse
    // should be able to see which she is looking at.
    examples: s.examples,
  }));
}

/** Train from the database and answer one complaint. */
export async function suggestFromHistory(complaint, options = {}) {
  const pairs = await loadTrainingPairs();
  const model = train(pairs);
  const predictions = predict(model, complaint, options);
  return {
    suggestions: predictions,
    trainedOn: pairs.length,
    vocabulary: model.vocabulary.size,
    medicines: model.items.size,
  };
}

/** What the model currently knows — for the status panel and for the thesis. */
export async function modelStats() {
  const pairs = await loadTrainingPairs();
  const model = train(pairs);
  const bySource = pairs.reduce((acc, p) => { acc[p.source] = (acc[p.source] ?? 0) + 1; return acc; }, {});
  return {
    examples: pairs.length,
    fromFormulary: bySource.formulary ?? 0,
    fromDispensed: bySource.dispensed ?? 0,
    medicines: model.items.size,
    vocabulary: model.vocabulary.size,
    ready: pairs.length > 0,
  };
}
