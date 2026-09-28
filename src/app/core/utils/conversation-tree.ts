import { Message } from '../models';

/** Índice de hijos por padre, ordenados por fecha de creación. */
export function buildChildrenIndex(messages: readonly Message[]): Map<string | null, Message[]> {
  const index = new Map<string | null, Message[]>();
  for (const m of messages) {
    const list = index.get(m.parentId);
    if (list) list.push(m);
    else index.set(m.parentId, [m]);
  }
  for (const list of index.values()) list.sort((a, b) => a.createdAt - b.createdAt);
  return index;
}

/** Ruta desde la raíz hasta `leafId` (incluido). Si la hoja no existe, devuelve []. */
export function getPathToLeaf(messages: readonly Message[], leafId: string | null): Message[] {
  if (!leafId) return [];
  const byId = new Map(messages.map((m) => [m.id, m] as const));
  const path: Message[] = [];
  const seen = new Set<string>();
  let current = byId.get(leafId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
}

/** Desciende desde `fromId` siguiendo siempre el hijo más reciente. */
export function deepestLeaf(
  messages: readonly Message[],
  fromId: string | null,
  index = buildChildrenIndex(messages),
): string | null {
  let current = fromId;
  const seen = new Set<string | null>();
  for (;;) {
    if (seen.has(current)) return current;
    seen.add(current);
    const children = index.get(current);
    if (!children || children.length === 0) return current;
    current = children[children.length - 1].id;
  }
}

export function getSiblings(messages: readonly Message[], message: Message): Message[] {
  return messages
    .filter((m) => m.parentId === message.parentId && m.role === message.role)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** IDs del subárbol que cuelga de `rootId` (incluido). */
export function collectSubtree(messages: readonly Message[], rootId: string): Set<string> {
  const index = buildChildrenIndex(messages);
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of index.get(id) ?? []) stack.push(child.id);
  }
  return result;
}

/** Hoja por defecto al abrir un chat: la hoja más reciente del árbol. */
export function latestLeaf(messages: readonly Message[]): string | null {
  if (messages.length === 0) return null;
  return deepestLeaf(messages, null);
}
