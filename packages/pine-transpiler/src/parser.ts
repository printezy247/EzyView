import { lex } from "./lexer.js";
import type { Token } from "./lexer.js";
import type { Block, Loc, Node, Script } from "./ast.js";

/** Thrown for any syntax error, carrying the source position. */
export class PineSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
  ) {
    super(`Pine syntax error at ${line}:${col} — ${message}`);
    this.name = "PineSyntaxError";
  }
}

/**
 * Recursive-descent parser for the Pine v5/v6 subset EzyView supports.
 *
 * Statement separators are newlines (Pine's automatic semicolon insertion), so
 * the parser consumes newline tokens between statements and tolerates blank
 * lines and continuations inside brackets.
 */
export function parse(source: string): Script {
  return new Parser(lex(source)).parseScript();
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parseScript(): Script {
    let declaration: Script["declaration"] = null;
    const body: Node[] = [];

    this.skipNewlines();
    // A leading indicator()/strategy() call sets the script's display options.
    if (this.peekIsIdent("indicator") || this.peekIsIdent("strategy")) {
      declaration = this.parseCallExpr() as Node as Script["declaration"];
      this.expectStatementEnd();
      this.skipNewlines();
    }

    while (!this.at("eof")) {
      body.push(this.parseStatement());
      this.skipNewlines();
    }

    return { declaration, body };
  }

  // --- statements -----------------------------------------------------------

  private parseStatement(): Node {
    const t = this.peek();

    if (t.type === "ident") {
      if (t.value === "if") return this.parseIf();
      if (t.value === "for") return this.parseFor();
      if (t.value === "while") return this.parseWhile();
      if (t.value === "return") return this.parseReturn();
    }

    // `var float x = …` / `float x = …` / `var x = …`
    if (t.type === "ident" && (t.value === "var" || this.isTypeKeyword(t.value))) {
      return this.parseTypedDecl();
    }

    return this.parseSimpleStatement();
  }

  /** `x = close`, `x := close[1]`, or a bare call like `plot(close)`. */
  private parseSimpleStatement(): Node {
    const start = this.peek();
    const loc = this.loc();

    // Lookahead for a declaration: ident followed by `=` or `:=` and not part
    // of a comparison. `x == y` must stay an expression.
    if (start.type === "ident" && !this.isReserved(start.value)) {
      const next = this.tokens[this.pos + 1];
      if (next?.type === "op" && next.value === "=") {
        this.advance();
        this.advance();
        const value = this.parseExpr();
        this.expectStatementEnd();
        return { kind: "DeclStmt", name: start.value, value, isVar: false, ...loc };
      }
      if (next?.type === "op" && next.value === ":=") {
        this.advance();
        this.advance();
        const value = this.parseExpr();
        this.expectStatementEnd();
        return {
          kind: "AssignExpr",
          operator: ":=",
          target: { kind: "Identifier", name: start.value, ...loc },
          value,
          ...loc,
        };
      }
    }

    const expression = this.parseExpr();
    this.expectStatementEnd();
    return { kind: "ExprStmt", expression, ...loc };
  }

  private parseTypedDecl(): Node {
    const loc = this.loc();
    const isVar = this.peekIsIdent("var");
    if (isVar) this.advance();

    // `var x = close` has no type keyword; the type slot then holds the name.
    let declaredType = "float";
    let name: string;
    const typeTok = this.peek();
    if (typeTok.type !== "ident") throw this.err("expected a type or name");
    this.advance();

    if (this.isTypeKeyword(typeTok.value)) {
      declaredType = typeTok.value;
      const nameTok = this.peek();
      if (nameTok.type !== "ident") throw this.err("expected a variable name");
      this.advance();
      name = nameTok.value;
    } else {
      // `var x = …` — typeTok was the name itself.
      name = typeTok.value;
      declaredType = "auto";
    }

    this.expectOp("=");
    const value = this.parseExpr();
    this.expectStatementEnd();
    return { kind: "VarDecl", declaredType, name, value, isVar, ...loc };
  }

  private parseIf(): Node {
    const loc = this.loc();
    this.advance(); // if
    const test = this.parseExpr();
    const consequent = this.parseBlock();
    let alternate: Block | null = null;

    this.skipNewlines();
    if (this.peekIsIdent("else")) {
      this.advance();
      this.skipNewlines();
      alternate = this.peekIsIdent("if")
        ? ({ kind: "Block", body: [this.parseIf()], ...this.loc() } as Block)
        : this.parseBlock();
    }
    return { kind: "IfStmt", test, consequent, alternate, ...loc };
  }

  private parseFor(): Node {
    const loc = this.loc();
    this.advance(); // for
    const nameTok = this.peek();
    if (nameTok.type !== "ident") throw this.err("expected a loop variable");
    this.advance();

    this.expectOp("=");
    const from = this.parseExpr();
    if (!this.peekIsIdent("to")) throw this.err("expected `to` in a for loop");
    this.advance();
    const to = this.parseExpr();

    let step: Node | null = null;
    if (this.peekIsIdent("by")) {
      this.advance();
      step = this.parseExpr();
    }

    const body = this.parseBlock();
    return { kind: "ForStmt", variable: nameTok.value, from, to, step, body, ...loc };
  }

  private parseWhile(): Node {
    const loc = this.loc();
    this.advance(); // while
    const test = this.parseExpr();
    const body = this.parseBlock();
    return { kind: "WhileStmt", test, body, ...loc };
  }

  private parseReturn(): Node {
    const loc = this.loc();
    this.advance(); // return
    if (this.atStatementEnd()) {
      this.expectStatementEnd();
      return { kind: "ReturnStmt", argument: null, ...loc };
    }
    const argument = this.parseExpr();
    this.expectStatementEnd();
    return { kind: "ReturnStmt", argument, ...loc };
  }

  /** A brace-delimited block. Pine also allows a single indented statement. */
  private parseBlock(): Block {
    const loc = this.loc();
    this.skipNewlines();

    if (this.at("punct") && this.peek().value === "{") {
      this.advance();
      const body: Node[] = [];
      this.skipNewlines();
      while (!this.at("punct") || this.peek().value !== "}") {
        if (this.at("eof")) throw this.err("unterminated block, expected `}`");
        body.push(this.parseStatement());
        this.skipNewlines();
      }
      this.advance(); // }
      return { kind: "Block", body, ...loc };
    }

    return { kind: "Block", body: [this.parseStatement()], ...loc };
  }

  // --- expressions ----------------------------------------------------------

  parseExpr(): Node {
    return this.parseTernary();
  }

  private parseTernary(): Node {
    const test = this.parseBinary(0);
    if (this.at("op") && this.peek().value === "?") {
      const loc = this.loc();
      this.advance();
      const consequent = this.parseTernary();
      this.expectOp(":");
      const alternate = this.parseTernary();
      return { kind: "TernaryExpr", test, consequent, alternate, ...loc };
    }
    return test;
  }

  /**
   * Precedence-climbing binary parse.
   *
   * Kept as a table rather than one method per level — Pine's operator set is
   * flat enough that a table is shorter and easier to audit than eight methods.
   */
  private parseBinary(minPrec: number): Node {
    let left = this.parseUnary();

    for (;;) {
      const t = this.peek();
      if (t.type !== "op") break;
      const prec = BINARY_PRECEDENCE[t.value];
      if (prec === undefined || prec < minPrec) break;

      const loc = this.loc();
      this.advance();
      // All Pine binary operators are left-associative.
      const right = this.parseBinary(prec + 1);
      left = { kind: "BinaryExpr", operator: t.value, left, right, ...loc };
    }

    // `:=` binds loosest, so it is checked after the loop.
    const t = this.peek();
    if (t.type === "op" && (t.value === ":=" || t.value === "=")) {
      if (left.kind !== "Identifier" && left.kind !== "MemberExpr" && left.kind !== "IndexExpr") {
        throw this.err("invalid assignment target");
      }
      const loc = this.loc();
      this.advance();
      const value = this.parseExpr();
      return { kind: "AssignExpr", operator: t.value, target: left, value, ...loc };
    }

    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.type === "op" && (t.value === "-" || t.value === "!" || t.value === "~")) {
      const loc = this.loc();
      this.advance();
      const argument = this.parseUnary();
      return { kind: "UnaryExpr", operator: t.value as "-" | "!" | "~", argument, ...loc };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();

    for (;;) {
      if (this.at("punct") && this.peek().value === "(") {
        const loc = this.loc();
        this.advance();
        const args: Node[] = [];
        this.skipNewlines();
        while (!(this.at("punct") && this.peek().value === ")")) {
          args.push(this.parseExpr());
          this.skipNewlines();
          if (this.at("punct") && this.peek().value === ",") {
            this.advance();
            this.skipNewlines();
            continue;
          }
          if (this.at("eof")) throw this.err("unterminated call, expected `)`");
          break;
        }
        this.expectPunct(")");
        node = { kind: "CallExpr", callee: node, args, ...loc };
        continue;
      }

      if (this.at("punct") && this.peek().value === "[") {
        const loc = this.loc();
        this.advance();
        const index = this.parseExpr();
        this.expectPunct("]");
        node = { kind: "IndexExpr", object: node, index, ...loc };
        continue;
      }

      if (this.at("punct") && this.peek().value === ".") {
        const loc = this.loc();
        this.advance();
        const nameTok = this.peek();
        if (nameTok.type !== "ident") throw this.err("expected a member name after `.`");
        this.advance();
        node = { kind: "MemberExpr", object: node, property: nameTok.value, ...loc };
        continue;
      }

      break;
    }

    return node;
  }

  private parsePrimary(): Node {
    const t = this.peek();
    const loc = this.loc();

    if (t.type === "number") {
      this.advance();
      return { kind: "NumberLit", value: t.literal as number, ...loc };
    }
    if (t.type === "string") {
      this.advance();
      return { kind: "StringLit", value: t.literal as string, ...loc };
    }
    if (t.type === "ident") {
      if (t.value === "true" || t.value === "false") {
        this.advance();
        return { kind: "BoolLit", value: t.value === "true", ...loc };
      }
      if (t.value === "na") {
        this.advance();
        return { kind: "NaLit", ...loc };
      }
      this.advance();
      return { kind: "Identifier", name: t.value, ...loc };
    }

    if (this.at("punct") && t.value === "(") {
      this.advance();
      const inner = this.parseExpr();
      this.expectPunct(")");
      return inner;
    }

    if (this.at("punct") && t.value === "[") {
      this.advance();
      const elements: Node[] = [];
      this.skipNewlines();
      while (!(this.at("punct") && this.peek().value === "]")) {
        elements.push(this.parseExpr());
        this.skipNewlines();
        if (this.at("punct") && this.peek().value === ",") {
          this.advance();
          this.skipNewlines();
        }
        if (this.at("eof")) throw this.err("unterminated array literal");
      }
      this.expectPunct("]");
      return { kind: "ArrayLit", elements, ...loc };
    }

    throw this.err(`unexpected ${t.type === "eof" ? "end of input" : `\`${t.value}\``}`);
  }

  private parseCallExpr(): Node {
    const loc = this.loc();
    const nameTok = this.peek();
    if (nameTok.type !== "ident") throw this.err("expected a function name");
    this.advance();
    this.expectPunct("(");
    const args: Node[] = [];
    this.skipNewlines();
    while (!(this.at("punct") && this.peek().value === ")")) {
      args.push(this.parseExpr());
      this.skipNewlines();
      if (this.at("punct") && this.peek().value === ",") {
        this.advance();
        this.skipNewlines();
      }
      if (this.at("eof")) throw this.err("unterminated call");
    }
    this.expectPunct(")");
    return { kind: "CallExpr", callee: { kind: "Identifier", name: nameTok.value, ...loc }, args, ...loc };
  }

  // --- helpers --------------------------------------------------------------

  /** True when the next token ends a statement, consuming one separator. */
  private expectStatementEnd(): void {
    if (this.at("eof")) return;
    if (this.at("punct") && this.peek().value === "}") return;
    if (this.at("newline")) {
      this.skipNewlines();
      return;
    }
    throw this.err(`expected a newline, found \`${this.peek().value}\``);
  }

  private atStatementEnd(): boolean {
    return this.at("eof") || this.at("newline") || (this.at("punct") && this.peek().value === "}");
  }

  private skipNewlines(): void {
    while (this.at("newline")) this.advance();
  }

  private isTypeKeyword(value: string): boolean {
    return TYPE_KEYWORDS.has(value);
  }

  private isReserved(value: string): boolean {
    return RESERVED.has(value);
  }

  private peekIsIdent(value: string): boolean {
    const t = this.peek();
    return t.type === "ident" && t.value === value;
  }

  private at(type: Token["type"]): boolean {
    return this.peek().type === type;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const t = this.tokens[this.pos]!;
    if (t.type !== "eof") this.pos++;
    return t;
  }

  private loc(): Loc {
    const t = this.peek();
    return { line: t.line, col: t.col };
  }

  private err(message: string): PineSyntaxError {
    const t = this.peek();
    return new PineSyntaxError(message, t.line, t.col);
  }

  private expectOp(op: string): void {
    const t = this.peek();
    if (t.type !== "op" || t.value !== op) throw this.err(`expected \`${op}\`, found \`${t.value}\``);
    this.advance();
  }

  private expectPunct(p: string): void {
    const t = this.peek();
    if (t.type !== "punct" || t.value !== p) throw this.err(`expected \`${p}\`, found \`${t.value}\``);
    this.advance();
  }
}

const TYPE_KEYWORDS = new Set(["int", "float", "bool", "string", "color", "series", "simple"]);

/** Words that can never start a bare declaration. */
const RESERVED = new Set([
  "if",
  "else",
  "for",
  "while",
  "return",
  "var",
  "true",
  "false",
  "na",
  "and",
  "or",
  "not",
]);

/** Pine operator precedence, higher binds tighter. */
const BINARY_PRECEDENCE: Record<string, number> = {
  "*": 12,
  "/": 12,
  "%": 12,
  "+": 11,
  "-": 11,
  "<<": 10,
  ">>": 10,
  "<": 9,
  "<=": 9,
  ">": 9,
  ">=": 9,
  "==": 8,
  "!=": 8,
  "&": 6,
  "^": 5,
  "|": 4,
  "&&": 3,
  "||": 2,
};
