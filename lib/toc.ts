export type Heading = { id: string; level: number; text: string };
export type TocNode = Heading & { children: TocNode[] };

export function buildTree(items: Heading[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const item of items) {
    const node: TocNode = { ...item, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

export function flatten(nodes: TocNode[]): TocNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Maps every heading id to the id of the root node it lives under. */
export function rootOf(nodes: TocNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  const walk = (list: TocNode[], rootId: string) => {
    for (const n of list) {
      map[n.id] = rootId;
      walk(n.children, rootId);
    }
  };
  for (const root of nodes) walk([root], root.id);
  return map;
}
