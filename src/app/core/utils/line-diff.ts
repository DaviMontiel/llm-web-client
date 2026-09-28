export type DiffLineType = 'context' | 'add' | 'remove';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

const MAX_CELLS = 4_000_000;

/**
 * Diff por líneas basado en LCS. Recorta prefijo/sufijo comunes para
 * reducir el coste; si el problema es demasiado grande, degrada a
 * "todo eliminado / todo añadido" en la zona central.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const result: DiffLine[] = [];
  for (let i = 0; i < start; i++) result.push({ type: 'context', text: a[i], oldNumber: i + 1, newNumber: i + 1 });

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  const n = midA.length;
  const m = midB.length;

  if (n * m > MAX_CELLS) {
    midA.forEach((text, i) => result.push({ type: 'remove', text, oldNumber: start + i + 1 }));
    midB.forEach((text, j) => result.push({ type: 'add', text, newNumber: start + j + 1 }));
  } else {
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        result.push({ type: 'context', text: midA[i], oldNumber: start + i + 1, newNumber: start + j + 1 });
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        result.push({ type: 'remove', text: midA[i], oldNumber: start + i + 1 });
        i++;
      } else {
        result.push({ type: 'add', text: midB[j], newNumber: start + j + 1 });
        j++;
      }
    }
    while (i < n) {
      result.push({ type: 'remove', text: midA[i], oldNumber: start + i + 1 });
      i++;
    }
    while (j < m) {
      result.push({ type: 'add', text: midB[j], newNumber: start + j + 1 });
      j++;
    }
  }

  const offsetA = endA + 1;
  const offsetB = endB + 1;
  for (let k = 0; offsetA + k < a.length; k++) {
    result.push({ type: 'context', text: a[offsetA + k], oldNumber: offsetA + k + 1, newNumber: offsetB + k + 1 });
  }
  return result;
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === 'add') added++;
    else if (l.type === 'remove') removed++;
  }
  return { added, removed };
}
