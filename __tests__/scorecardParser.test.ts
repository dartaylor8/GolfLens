import {
  getLiveScoreRowsFromRecognition,
  getScanWarning,
  summarizePlayerRows,
  type TextRecognitionLike,
} from '../src/scorecardParser';

function scorecardLine(
  text: string,
  top: number,
  tokens: string[],
): TextRecognitionLike['blocks'][number]['lines'][number] {
  const elements = tokens.map((token, index) => ({
    frame: {
      height: 18,
      left: 12 + index * 34,
      top,
      width: Math.max(18, token.length * 8),
    },
    text: token,
  }));

  return {
    elements,
    frame: {
      height: 24,
      left: 10,
      top,
      width: 420,
    },
    text,
  };
}

test('extracts live player score rows without counting name letters as scores', () => {
  const rows = getLiveScoreRowsFromRecognition({
    blocks: [
      {
        lines: [
          scorecardLine('Hole 1 2 3 4 5 6 7 8 9', 10, [
            'Hole',
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9',
          ]),
          scorecardLine('Darius 4 4 5 5 4 3 4 5 4', 70, [
            'Darius',
            '4',
            '4',
            '5',
            '5',
            '4',
            '3',
            '4',
            '5',
            '4',
          ]),
          scorecardLine('Dad 5 4 6 4 5 3 5 6 4', 110, [
            'Dad',
            '5',
            '4',
            '6',
            '4',
            '5',
            '3',
            '5',
            '6',
            '4',
          ]),
        ],
      },
    ],
  });

  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    confidence: 'high',
    name: 'Darius',
    scores: [4, 4, 5, 5, 4, 3, 4, 5, 4],
    total: 38,
  });
  expect(rows[1]).toMatchObject({
    name: 'Dad',
    total: 42,
  });
});

test('dedupes repeated player rows and summarizes committed totals', () => {
  const rows = getLiveScoreRowsFromRecognition({
    blocks: [
      {
        lines: [
          scorecardLine('Maya 5 4 5 4 4 3 5 5 4', 20, [
            'Maya',
            '5',
            '4',
            '5',
            '4',
            '4',
            '3',
            '5',
            '5',
            '4',
          ]),
          scorecardLine('Maya 5 4 5 4 4 3 5 5 4', 60, [
            'Maya',
            '5',
            '4',
            '5',
            '4',
            '4',
            '3',
            '5',
            '5',
            '4',
          ]),
        ],
      },
    ],
  });

  expect(rows).toHaveLength(1);
  expect(summarizePlayerRows(rows)).toBe('Maya: 5 4 5 4 4 3 5 5 4 = 39');
});

test('flags incomplete score rows for review', () => {
  const rows = getLiveScoreRowsFromRecognition({
    blocks: [
      {
        lines: [scorecardLine('Lee 4 4 5', 20, ['Lee', '4', '4', '5'])],
      },
    ],
  });

  expect(rows[0]).toMatchObject({
    confidence: 'review',
    scores: [4, 4, 5],
  });
  expect(getScanWarning(rows)).toBe(
    'Missing numbers for Lee. Hold still so handwriting is clearer.',
  );
});

test('keeps player names when row starts with numbering and excludes metadata rows', () => {
  const rows = getLiveScoreRowsFromRecognition({
    blocks: [
      {
        lines: [
          scorecardLine('HCP 8 7 6 5 4 3 2 1 0', 12, [
            'HCP',
            '8',
            '7',
            '6',
            '5',
            '4',
            '3',
            '2',
            '1',
            '0',
          ]),
          scorecardLine('1. Darius 4 4 5 5 4 3 4 5 4', 45, [
            '1.',
            'Darius',
            '4',
            '4',
            '5',
            '5',
            '4',
            '3',
            '4',
            '5',
            '4',
          ]),
        ],
      },
    ],
  });

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: 'Darius',
    scores: [4, 4, 5, 5, 4, 3, 4, 5, 4],
  });
});

test('ignores non-player ui text rows even when they contain score-like numbers', () => {
  const rows = getLiveScoreRowsFromRecognition({
    blocks: [
      {
        lines: [
          scorecardLine('Running GolfLens on: 5 5 1 3 5 4 3 5 5', 20, [
            'Running',
            'GolfLens',
            'on:',
            '5',
            '5',
            '1',
            '3',
            '5',
            '4',
            '3',
            '5',
            '5',
          ]),
          scorecardLine('Messages File Edit 1 1 1 1 1 1 1 1 1', 50, [
            'Messages',
            'File',
            'Edit',
            '1',
            '1',
            '1',
            '1',
            '1',
            '1',
            '1',
            '1',
            '1',
          ]),
          scorecardLine('Maya 5 4 5 4 4 3 5 5 4', 90, [
            'Maya',
            '5',
            '4',
            '5',
            '4',
            '4',
            '3',
            '5',
            '5',
            '4',
          ]),
        ],
      },
    ],
  });

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    name: 'Maya',
    total: 39,
  });
});
