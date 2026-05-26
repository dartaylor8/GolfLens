export type ScoreConfidence = 'high' | 'review';

export type FrameRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type PlayerScoreRow = {
  confidence: ScoreConfidence;
  id: string;
  name: string;
  scores: number[];
  total: number;
};

export type ParsedRowWithFrame = PlayerScoreRow & {
  frame?: FrameRect;
  unreadableFrames?: FrameRect[];
};

type RecognizedElement = {
  frame?: FrameRect | null;
  text: string;
};

type RecognizedLine = {
  elements?: RecognizedElement[] | null;
  frame?: FrameRect | null;
  text: string;
};

type RecognizedBlock = {
  lines: RecognizedLine[];
};

export type TextRecognitionLike = {
  blocks: RecognizedBlock[];
};

const DISPLAYED_SCORE_COUNT = 9;
const NON_PLAYER_NAME_WORDS = new Set([
  'capture',
  'clearer',
  'edit',
  'file',
  'golflens',
  'hold',
  'iphone',
  'latest',
  'messages',
  'needs',
  'on',
  'pro',
  'reset',
  'review',
  'running',
  'saw',
  'score',
  'still',
  'total',
  'dts',
]);

export function getLiveScoreRowsFromRecognition(result: TextRecognitionLike) {
  const parsedRows = getPlayerScoreRowsFromSpatialLayout(result).map(row => {
    const scores = normalizeDisplayedScores(row.scores);
    const confidence = getScoreConfidence(scores);

    return {
      ...row,
      confidence,
      id: `${row.name}-${scores.join('-')}`,
      scores,
      total: scores.reduce((sum, score) => sum + score, 0),
    };
  });

  return dedupePlayerRows(parsedRows);
}

export function getScanWarning(rows: ParsedRowWithFrame[]) {
  if (rows.length === 0) {
    return 'No player rows detected yet. Move closer and align the score rows.';
  }

  const missing = rows.find(row => row.scores.length < DISPLAYED_SCORE_COUNT);
  if (missing) {
    return `Missing numbers for ${missing.name}. Hold still so handwriting is clearer.`;
  }

  const review = rows.find(row => row.confidence === 'review');
  if (review) {
    return `OCR is unsure about ${review.name}. Keep the row flat and in focus.`;
  }

  return null;
}

export function getPlayerScoreRowsFromSpatialLayout(
  result: TextRecognitionLike,
) {
  const items = result.blocks.flatMap(block =>
    block.lines.flatMap(line => {
      const lineFrame = line.frame;
      const elementTexts = line.elements
        ?.map(element => element.text.trim())
        .filter(Boolean);
      const lineText = line.text.trim();
      const tokens =
        elementTexts && elementTexts.length > 0
          ? elementTexts
          : splitLineTokens(lineText);
      const top =
        lineFrame?.top ?? line.elements?.[0]?.frame?.top ?? Number.NaN;
      const left =
        lineFrame?.left ?? line.elements?.[0]?.frame?.left ?? Number.NaN;
      const height =
        lineFrame?.height ?? line.elements?.[0]?.frame?.height ?? 24;
      const width = lineFrame?.width ?? line.elements?.[0]?.frame?.width ?? 120;
      const elements = (line.elements ?? [])
        .map(element => {
          if (!element.frame) {
            return null;
          }
          return {
            frame: {
              height: element.frame.height,
              left: element.frame.left,
              top: element.frame.top,
              width: element.frame.width,
            },
            text: element.text.trim(),
          };
        })
        .filter((element): element is { frame: FrameRect; text: string } =>
          Boolean(element?.text),
        );

      if (
        !Number.isFinite(top) ||
        !Number.isFinite(left) ||
        tokens.length === 0
      ) {
        return [];
      }

      return [{ elements, height, left, text: lineText, tokens, top, width }];
    }),
  );

  if (items.length === 0) {
    return [];
  }

  const sorted = [...items].sort((a, b) => a.top - b.top);
  const avgHeight =
    sorted.reduce((sum, item) => sum + Math.max(16, item.height), 0) /
    Math.max(1, sorted.length);
  const rowTolerance = Math.max(12, avgHeight * 0.6);
  const groupedRows: Array<typeof sorted> = [];

  for (const item of sorted) {
    const lastRow = groupedRows[groupedRows.length - 1];
    if (!lastRow) {
      groupedRows.push([item]);
      continue;
    }
    const rowCenter =
      lastRow.reduce((sum, rowItem) => sum + rowItem.top, 0) / lastRow.length;
    if (Math.abs(item.top - rowCenter) <= rowTolerance) {
      lastRow.push(item);
    } else {
      groupedRows.push([item]);
    }
  }

  return groupedRows
    .map(group => buildPlayerRowFromSpatialGroup(group))
    .filter((row): row is ParsedRowWithFrame => Boolean(row));
}

export function normalizeDisplayedScores(scores: number[]) {
  if (scores.length === 0) {
    return scores;
  }

  const clipped = scores.filter(score => score >= 1 && score <= 12);
  if (clipped.length <= DISPLAYED_SCORE_COUNT) {
    return clipped;
  }

  return clipped.slice(0, DISPLAYED_SCORE_COUNT);
}

export function dedupePlayerRows(rows: ParsedRowWithFrame[]) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.name.toLowerCase()}-${row.scores.join('-')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function summarizePlayerRows(rows: ParsedRowWithFrame[]) {
  return rows
    .map(row => `${row.name}: ${row.scores.join(' ')} = ${row.total}`)
    .join('\n');
}

function buildPlayerRowFromSpatialGroup(
  group: Array<{
    height: number;
    left: number;
    elements: Array<{ frame: FrameRect; text: string }>;
    text: string;
    tokens: string[];
    top: number;
    width: number;
  }>,
): ParsedRowWithFrame | null {
  const ordered = [...group].sort((a, b) => a.left - b.left);
  const mergedText = ordered.map(item => item.text).join(' ');
  const mergedTokens = ordered.flatMap(item => item.tokens);
  const mergedElements = ordered
    .flatMap(item => item.elements)
    .sort((a, b) => a.frame.left - b.frame.left);
  const name = getPlayerName(ordered[0]?.text ?? mergedText, mergedTokens);
  let { scores, unreadableFrames } = parseScoresFromElements(mergedElements);
  if (scores.length === 0) {
    scores = parseScoreTokens(mergedTokens.join(' ')).slice(0, 18);
  }
  if (/^\s*\d{1,2}[.)]\s*[A-Za-z]/.test(mergedText) && scores.length > 0) {
    scores = scores.slice(1);
  }

  if (!name || scores.length < 3 || looksLikeMetadataRow(name, scores)) {
    return null;
  }

  const left = Math.min(...ordered.map(item => item.left));
  const top = Math.min(...ordered.map(item => item.top));
  const right = Math.max(...ordered.map(item => item.left + item.width));
  const bottom = Math.max(...ordered.map(item => item.top + item.height));
  const frame = {
    height: Math.max(24, bottom - top),
    left,
    top,
    width: Math.max(120, right - left),
  };

  return {
    confidence: getScoreConfidence(scores),
    frame,
    id: `${name}-${scores.join('-')}`,
    name,
    scores,
    total: scores.reduce((sum, score) => sum + score, 0),
    unreadableFrames,
  };
}

function parseScoresFromElements(
  elements: Array<{ frame: FrameRect; text: string }>,
) {
  const scores: number[] = [];
  const unreadableFrames: FrameRect[] = [];

  for (const element of elements) {
    if (scores.length >= 18) {
      break;
    }
    const raw = element.text.trim();
    if (!raw) {
      continue;
    }

    if (!looksLikeScoreToken(raw)) {
      continue;
    }

    const cleaned = normalizeScoreText(raw).replace(/[^\d]/g, '');
    if (!cleaned) {
      continue;
    }

    if (/^\d{1,2}$/.test(cleaned)) {
      const value = Number(cleaned);
      if (value >= 1 && value <= 12) {
        scores.push(value);
        continue;
      }
    }

    if (/^\d{6,18}$/.test(cleaned)) {
      const runScores = cleaned
        .split('')
        .map(token => Number(token))
        .filter(value => Number.isInteger(value) && value >= 1 && value <= 9);

      if (runScores.length > 0) {
        scores.push(...runScores);
        continue;
      }
    }

    unreadableFrames.push(element.frame);
  }

  return {
    scores: scores.slice(0, 18),
    unreadableFrames,
  };
}

function splitLineTokens(text: string) {
  return text
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function parseScoreTokens(text: string) {
  const normalized = normalizeScoreText(text);
  const explicitTokens = (normalized.match(/\b\d{1,2}\b/g) ?? [])
    .map(token => Number(token))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 12);

  if (explicitTokens.length >= 3) {
    return explicitTokens;
  }

  const compactRuns = normalized.match(/\d{6,18}/g) ?? [];
  return compactRuns
    .flatMap(run => run.split(''))
    .map(token => Number(token))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 9);
}

function getPlayerName(text: string, orderedTokens: string[] = []) {
  const tokenName = extractNameFromTokens(orderedTokens);
  const tokenNameWords = getCandidateNameWords(tokenName);
  const cleanedName = text
    .replace(tokenName, tokenName ? `${tokenName} ` : '')
    .replace(/\d+/g, ' ')
    .replace(/[^A-Za-z .'-]/g, ' ')
    .replace(
      /\b(player|name|gross|net|total|out|in|score|hole|holes|par|yard|yards|yardage|tee|tees|hcp|hdcp|handicap)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (tokenNameWords.length > 0 && !isIgnoredScorecardLabel(tokenName)) {
    return tokenNameWords.join(' ');
  }

  const words = getCandidateNameWords(cleanedName);
  return words.length === 0 ? '' : words.slice(0, 3).join(' ');
}

function extractNameFromTokens(tokens: string[]) {
  const nameTokens: string[] = [];
  let startedName = false;

  for (const token of tokens) {
    const cleaned = token.trim();
    if (!cleaned) {
      continue;
    }

    const hasDigit = /\d/.test(cleaned);
    const normalized = cleaned
      .replace(/^[^A-Za-z]+/, '')
      .replace(/[^A-Za-z.'-]+$/g, '')
      .replace(/[^A-Za-z .'-]/g, '')
      .trim();

    if (!normalized) {
      if (startedName && hasDigit) {
        break;
      }
      continue;
    }

    if (hasDigit && startedName) {
      break;
    }

    if (looksLikeScoreToken(cleaned)) {
      if (startedName) {
        break;
      }
      continue;
    }

    nameTokens.push(normalized);
    startedName = true;

    if (nameTokens.length >= 3) {
      break;
    }
  }

  return nameTokens.join(' ');
}

function isIgnoredScorecardLabel(label: string) {
  return /^(hole|holes|par|yard|yards|yardage|hcp|hdcp|handicap|index|rating|slope|out|in|total|totals|score|scores|front|back|tee|tees)$/i.test(
    label.trim(),
  );
}

function looksLikeMetadataRow(name: string, scores: number[]) {
  if (
    isIgnoredScorecardLabel(name) ||
    /^official scorecard$/i.test(name.trim())
  ) {
    return true;
  }
  return scores.some(score => score > 12);
}

function normalizeScoreText(text: string) {
  return text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Bb]/g, '8')
    .replace(/[Ss]/g, '5');
}

function looksLikeScoreToken(text: string) {
  const compact = text.replace(/\s+/g, '');
  return /\d/.test(compact) || /^[OoIl|BbSs]+$/.test(compact);
}

function getScoreConfidence(scores: number[]): ScoreConfidence {
  return scores.length >= DISPLAYED_SCORE_COUNT ? 'high' : 'review';
}

function getCandidateNameWords(text: string) {
  return text
    .split(' ')
    .map(word => word.trim())
    .filter(word => word.length > 1)
    .filter(word => !isNonPlayerNameWord(word))
    .slice(0, 3);
}

function isNonPlayerNameWord(word: string) {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalized) {
    return false;
  }
  return NON_PLAYER_NAME_WORDS.has(normalized);
}
