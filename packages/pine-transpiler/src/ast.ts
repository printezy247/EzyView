/** Pine AST. Every node carries the source location for error reporting. */

export interface Loc {
  line: number;
  col: number;
}

export type Node =
  | NumberLit
  | StringLit
  | BoolLit
  | NaLit
  | Identifier
  | MemberExpr
  | IndexExpr
  | CallExpr
  | UnaryExpr
  | BinaryExpr
  | TernaryExpr
  | AssignExpr
  | ArrayLit
  | Block
  | IfStmt
  | ForStmt
  | WhileStmt
  | ReturnStmt
  | ExprStmt
  | VarDecl
  | DeclStmt;

export interface NumberLit extends Loc {
  kind: "NumberLit";
  value: number;
}

export interface StringLit extends Loc {
  kind: "StringLit";
  value: string;
}

export interface BoolLit extends Loc {
  kind: "BoolLit";
  value: boolean;
}

export interface NaLit extends Loc {
  kind: "NaLit";
}

export interface Identifier extends Loc {
  kind: "Identifier";
  name: string;
}

export interface MemberExpr extends Loc {
  kind: "MemberExpr";
  object: Node;
  property: string;
}

/** `src[n]` — a series offset. A plain `array[i]` is the same node; Pine uses
 * the offset semantics for series and the runtime decides which applies. */
export interface IndexExpr extends Loc {
  kind: "IndexExpr";
  object: Node;
  index: Node;
}

export interface CallExpr extends Loc {
  kind: "CallExpr";
  callee: Node;
  args: Node[];
}

export interface UnaryExpr extends Loc {
  kind: "UnaryExpr";
  operator: "-" | "!" | "~";
  argument: Node;
}

export interface BinaryExpr extends Loc {
  kind: "BinaryExpr";
  operator: string;
  left: Node;
  right: Node;
}

export interface TernaryExpr extends Loc {
  kind: "TernaryExpr";
  test: Node;
  consequent: Node;
  alternate: Node;
}

export interface AssignExpr extends Loc {
  kind: "AssignExpr";
  operator: "=" | ":=";
  target: Node;
  value: Node;
}

export interface ArrayLit extends Loc {
  kind: "ArrayLit";
  elements: Node[];
}

export interface Block extends Loc {
  kind: "Block";
  body: Node[];
}

export interface IfStmt extends Loc {
  kind: "IfStmt";
  test: Node;
  consequent: Block;
  alternate: Block | null;
}

export interface ForStmt extends Loc {
  kind: "ForStmt";
  /** `for i = 0 to 9` — the loop variable, declared fresh each iteration. */
  variable: string;
  from: Node;
  to: Node;
  step: Node | null;
  body: Block;
}

export interface WhileStmt extends Loc {
  kind: "WhileStmt";
  test: Node;
  body: Block;
}

export interface ReturnStmt extends Loc {
  kind: "ReturnStmt";
  argument: Node | null;
}

export interface ExprStmt extends Loc {
  kind: "ExprStmt";
  expression: Node;
}

/** `float x = close` — typed declaration. */
export interface VarDecl extends Loc {
  kind: "VarDecl";
  declaredType: string;
  name: string;
  value: Node | null;
  /** `var` keeps the value across bars instead of resetting to `na`. */
  isVar: boolean;
}

/** `x = close` — bare assignment that also declares. */
export interface DeclStmt extends Loc {
  kind: "DeclStmt";
  name: string;
  value: Node;
  isVar: boolean;
}

/** Top-level script wrapper: indicator/strategy call plus a body. */
export interface Script {
  /** `indicator("…")` or `strategy("…")`. */
  declaration: CallExpr | null;
  body: Node[];
}

/** Collect every identifier a node references, for scope analysis. */
export function identifiers(node: Node): Set<string> {
  const out = new Set<string>();
  walk(node, (n) => {
    if (n.kind === "Identifier") out.add(n.name);
  });
  return out;
}

/** Depth-first walk over every child node. */
export function walk(node: Node | Node[], visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  visit(node);
  const kids = children(node);
  for (const k of kids) walk(k, visit);
}

function children(node: Node): Node[] {
  switch (node.kind) {
    case "MemberExpr":
      return [node.object];
    case "IndexExpr":
      return [node.object, node.index];
    case "CallExpr":
      return [node.callee, ...node.args];
    case "UnaryExpr":
      return [node.argument];
    case "BinaryExpr":
      return [node.left, node.right];
    case "TernaryExpr":
      return [node.test, node.consequent, node.alternate];
    case "AssignExpr":
      return [node.target, node.value];
    case "ArrayLit":
      return node.elements;
    case "Block":
      return node.body;
    case "IfStmt":
      return [node.test, node.consequent, ...(node.alternate ? [node.alternate] : [])];
    case "ForStmt":
      return [node.from, node.to, ...(node.step ? [node.step] : []), node.body];
    case "WhileStmt":
      return [node.test, node.body];
    case "ReturnStmt":
      return node.argument ? [node.argument] : [];
    case "ExprStmt":
      return [node.expression];
    case "VarDecl":
      return node.value ? [node.value] : [];
    case "DeclStmt":
      return [node.value];
    default:
      return [];
  }
}
