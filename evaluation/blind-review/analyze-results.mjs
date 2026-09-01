import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const defaultInput = path.join(repositoryRoot, 'artifacts', 'external-eval', 'blind-review', 'forms', 'participant-records.csv');
const defaultKey = path.join(repositoryRoot, 'artifacts', 'external-eval', 'blind-review', 'admin', 'randomization-key.json');
const defaultOutput = path.join(repositoryRoot, 'artifacts', 'external-eval', 'blind-review', 'results', 'human-review-analysis.json');
const inputPath = path.resolve(process.argv[2] ?? defaultInput);
const keyPath = path.resolve(process.argv[3] ?? defaultKey);
const outputPath = path.resolve(process.argv[4] ?? defaultOutput);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const [header, ...values] = rows;
  return values.map((columns) => Object.fromEntries(header.map((name, index) => [name, columns[index] ?? ''])));
}

const number = (value) => value === '' ? Number.NaN : Number(value);
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};
const mean = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};

const records = parseCsv(await readFile(inputPath, 'utf8'));
const key = JSON.parse(await readFile(keyPath, 'utf8'));
const v3Code = Object.entries(key.mapping).find(([, value]) => value.version === 'v3')?.[0];
const requiredNumeric = [
  ...Array.from({ length: 7 }, (_, task) => [`task${task + 1}_success`, `task${task + 1}_time_s`, `task${task + 1}_errors`]).flat(),
  'visual_structure', 'visual_proportion', 'visual_materials', 'visual_internals', 'visual_section', 'visual_labels',
  ...Array.from({ length: 10 }, (_, item) => `sus${item + 1}`),
];

const exclusions = [];
const preliminarilyValid = records.filter((record) => {
  const reasons = [];
  if (record.consent.toLowerCase() !== 'yes') reasons.push('consent missing');
  if (record.technical_failure.toLowerCase() === 'yes') reasons.push('self-reported technical failure');
  if (record.prior_mapping_known.toLowerCase() === 'yes') reasons.push('participant knew anonymous mapping');
  const unfinishedTasks = Array.from({ length: 7 }, (_, index) => record[`task${index + 1}_success`] === '').filter(Boolean).length;
  if (unfinishedTasks > 1) reasons.push('more than one task unfinished');
  const missingRate = requiredNumeric.filter((column) => record[column] === '').length / requiredNumeric.length;
  if (missingRate > 0.2) reasons.push('more than 20 percent required data missing');
  if (reasons.length) exclusions.push({ participantId: record.participant_id, modelCode: record.model_code, reasons });
  return reasons.length === 0;
});

const recordsByParticipant = Map.groupBy(preliminarilyValid, (record) => record.participant_id);
const validParticipantIds = [...recordsByParticipant.entries()]
  .filter(([, participantRecords]) => new Set(participantRecords.map((record) => record.model_code)).size === 2)
  .map(([participantId]) => participantId);
const validRecords = preliminarilyValid.filter((record) => validParticipantIds.includes(record.participant_id));
for (const [participantId, participantRecords] of recordsByParticipant.entries()) {
  if (!validParticipantIds.includes(participantId)) exclusions.push({ participantId, reasons: ['both anonymous models were not completed'] });
}

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  inputPath,
  rawRecordCount: records.length,
  validParticipantCount: validParticipantIds.length,
  minimumRequiredParticipants: 8,
  exclusions,
  status: validParticipantIds.length >= 8 ? 'complete' : 'pending',
  score: null,
};

if (result.status === 'complete') {
  const v3Records = validRecords.filter((record) => record.model_code === v3Code);
  const v2Records = validRecords.filter((record) => record.model_code !== v3Code);
  const taskOpportunities = v3Records.length * 7;
  const successCount = v3Records.reduce((sum, record) => sum + Array.from({ length: 7 }, (_, index) => number(record[`task${index + 1}_success`]) === 1 ? 1 : 0).reduce((a, b) => a + b, 0), 0);
  const completionRate = successCount / taskOpportunities;
  const totalTime = (record) => Array.from({ length: 7 }, (_, index) => number(record[`task${index + 1}_time_s`])).filter(Number.isFinite).reduce((a, b) => a + b, 0);
  const v3MedianTime = median(v3Records.map(totalTime));
  const v2MedianTime = median(v2Records.map(totalTime));
  const timeRatio = v3MedianTime / v2MedianTime;
  const errors = v3Records.reduce((sum, record) => sum + Array.from({ length: 7 }, (_, index) => number(record[`task${index + 1}_errors`])).filter(Number.isFinite).reduce((a, b) => a + b, 0), 0);
  const errorRate = errors / taskOpportunities;
  const visualColumns = ['visual_structure', 'visual_proportion', 'visual_materials', 'visual_internals', 'visual_section', 'visual_labels'];
  const visualMeans = Object.fromEntries(visualColumns.map((column) => [column, mean(v3Records.map((record) => number(record[column])))]));
  const susScore = (record) => Array.from({ length: 10 }, (_, index) => {
    const response = number(record[`sus${index + 1}`]);
    return index % 2 === 0 ? response - 1 : 5 - response;
  }).reduce((a, b) => a + b, 0) * 2.5;
  const averageSus = mean(v3Records.map(susScore));

  const completionPoints = completionRate >= 0.9 ? 5 : completionRate >= 0.8 ? 4 : completionRate >= 0.7 ? 3 : completionRate >= 0.6 ? 2 : 0;
  const timePoints = timeRatio <= 0.95 ? 2 : timeRatio <= 1.1 ? 1 : 0;
  const errorPoints = errorRate <= 0.05 ? 3 : errorRate <= 0.1 ? 2 : errorRate <= 0.2 ? 1 : 0;
  const visualPoints = Object.values(visualMeans).reduce((sum, value) => sum + value / 7, 0);
  const susPoints = averageSus >= 85 ? 4 : averageSus >= 80 ? 3 : averageSus >= 68 ? 2 : averageSus >= 50 ? 1 : 0;

  result.metrics = { completionRate, v3MedianTime, v2MedianTime, timeRatio, errorRate, visualMeans, averageSus };
  result.score = { completionPoints, timePoints, errorPoints, visualPoints, susPoints, total: completionPoints + timePoints + errorPoints + visualPoints + susPoints, maximum: 20 };
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
process.stdout.write(JSON.stringify(result, null, 2));
