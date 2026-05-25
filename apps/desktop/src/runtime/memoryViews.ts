import type { MemoryRecord } from "@ai-orchestrator/protocol";

export type MemoryViewName = "lexical" | "semantic" | "metadata";

export type ViewResult = {
  recordId: string;
  rank: number;
  rawScore: number;
  view: MemoryViewName;
};

export type FusionResult = {
  recordId: string;
  fusedScore: number;
  viewBreakdown: ViewResult[];
};

const bm25K1 = 1.5;
const bm25B = 0.75;

export function lexicalView(query: string, records: MemoryRecord[], k: number): ViewResult[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || records.length === 0 || k <= 0) {
    return [];
  }

  const documents = records.map((record) => ({
    record,
    terms: memoryRecordTerms(record),
  }));
  const averageLength = documents.reduce((sum, document) => sum + document.terms.length, 0) / Math.max(documents.length, 1);
  const documentFrequency = new Map<string, number>();

  for (const queryTerm of new Set(queryTerms)) {
    documentFrequency.set(
      queryTerm,
      documents.filter((document) => new Set(document.terms).has(queryTerm)).length,
    );
  }

  return documents
    .map((document) => {
      const termCounts = countTerms(document.terms);
      const rawScore = queryTerms.reduce((score, queryTerm) => {
        const frequency = termCounts.get(queryTerm) ?? 0;
        if (frequency === 0) {
          return score;
        }
        const documentLength = Math.max(document.terms.length, 1);
        const df = documentFrequency.get(queryTerm) ?? 0;
        const idf = Math.log((records.length - df + 0.5) / (df + 0.5) + 1);
        const numerator = frequency * (bm25K1 + 1);
        const denominator = frequency + bm25K1 * (1 - bm25B + bm25B * (documentLength / Math.max(averageLength, 1)));
        return score + idf * (numerator / denominator);
      }, 0);

      return {
        recordId: document.record.id,
        rank: 0,
        rawScore,
        view: "lexical" as const,
      };
    })
    .filter((result) => result.rawScore > 0)
    .sort((left, right) => right.rawScore - left.rawScore || left.recordId.localeCompare(right.recordId))
    .slice(0, k)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

export function semanticView(_query: string, _records: MemoryRecord[], _k: number): ViewResult[] {
  return [];
}

export function metadataView(
  _query: string,
  records: MemoryRecord[],
  k: number,
  extracted: { persons: string[]; entities: string[] },
): ViewResult[] {
  if (k <= 0) {
    return [];
  }
  const queryPersons = normalizeSet(extracted.persons);
  const queryEntities = normalizeSet(extracted.entities);

  return records
    .map((record) => {
      const recordPersons = normalizeSet(record.persons ?? []);
      const recordEntities = normalizeSet(record.entities ?? []);
      const rawScore = intersectionSize(queryPersons, recordPersons) + intersectionSize(queryEntities, recordEntities);
      return {
        recordId: record.id,
        rank: 0,
        rawScore,
        view: "metadata" as const,
      };
    })
    .filter((result) => result.rawScore > 0)
    .sort((left, right) => right.rawScore - left.rawScore || left.recordId.localeCompare(right.recordId))
    .slice(0, k)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

export function rrfFuse(viewResults: ViewResult[][], k = 60): FusionResult[] {
  const byRecord = new Map<string, FusionResult>();

  for (const results of viewResults) {
    for (const result of results) {
      const current = byRecord.get(result.recordId) ?? {
        recordId: result.recordId,
        fusedScore: 0,
        viewBreakdown: [],
      };
      current.fusedScore += 1 / (k + result.rank);
      current.viewBreakdown.push(result);
      byRecord.set(result.recordId, current);
    }
  }

  return [...byRecord.values()].sort(
    (left, right) => right.fusedScore - left.fusedScore || left.recordId.localeCompare(right.recordId),
  );
}

function memoryRecordTerms(record: MemoryRecord) {
  const keywords = record.keywords?.flatMap(tokenize) ?? [];
  if (keywords.length > 0) {
    return keywords;
  }
  return tokenize(`${record.title} ${record.content} ${(record.tags ?? []).join(" ")}`);
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}_-]+|[^\p{L}\p{N}_-]+$/gu, ""))
    .filter(Boolean);
}

function countTerms(terms: string[]) {
  const counts = new Map<string, number>();
  for (const term of terms) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

function normalizeSet(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}
