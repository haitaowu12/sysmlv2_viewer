/**
 * SysML v2 Textual Notation Parser
 * 
 * A recursive-descent parser that converts SysML v2 textual notation
 * into a structured AST (Abstract Syntax Tree).
 * 
 * Supports: packages, part/port/connection/interface/action/state/requirement/
 * constraint/attribute/item/enum definitions and usages, transitions, flows,
 * bindings, imports, comments, and doc annotations.
 */

import type {
    SysMLNode,
    SysMLModel,
    ParseError,
    Package,
    PartDef,
    PartUsage,
    PortDef,
    PortUsage,
    ConnectionDef,
    ConnectionUsage,
    InterfaceDef,
    ActionDef,
    ActionUsage,
    ActionParam,
    StateDef,
    StateUsage,
    TransitionUsage,
    RequirementDef,
    RequirementUsage,
    ConstraintDef,
    ConstraintUsage,
    AttributeDef,
    AttributeUsage,
    ItemDef,
    ItemUsage,
    EnumDef,
    FlowUsage,
    BindingUsage,
    ImportNode,
    DocNode,
    EndFeature,
} from './types';

class Lexer {
    private pos = 0;
    private line = 1;
    private col = 1;
    private input: string;

    constructor(input: string) {
        this.input = input;
    }

    get position() {
        return { line: this.line, column: this.col, offset: this.pos };
    }

    get remaining() {
        return this.input.slice(this.pos);
    }

    get eof() {
        return this.pos >= this.input.length;
    }

    peek(n = 1): string {
        return this.input.slice(this.pos, this.pos + n);
    }

    advance(n = 1): string {
        const s = this.input.slice(this.pos, this.pos + n);
        for (const ch of s) {
            if (ch === '\n') {
                this.line++;
                this.col = 1;
            } else {
                this.col++;
            }
        }
        this.pos += n;
        return s;
    }

    skipWhitespace() {
        while (!this.eof) {
            const ch = this.peek();
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
                this.advance();
            } else if (this.peek(2) === '//') {
                // Line comment
                while (!this.eof && this.peek() !== '\n') this.advance();
            } else if (this.peek(2) === '/*') {
                // Block comment (but not doc /* */)
                const startPos = this.pos;
                // Check if it's a doc comment - don't skip those
                if (this.input.indexOf('doc', startPos - 4) === startPos - 4) {
                    break;
                }
                this.advance(2);
                while (!this.eof && this.peek(2) !== '*/') this.advance();
                if (!this.eof) this.advance(2);
            } else {
                break;
            }
        }
    }

    match(str: string): boolean {
        this.skipWhitespace();
        if (this.input.startsWith(str, this.pos)) {
            // For keyword matching, ensure it's not part of a larger identifier
            if (/[a-zA-Z_]/.test(str[str.length - 1])) {
                const nextChar = this.input[this.pos + str.length];
                if (nextChar && /[a-zA-Z0-9_]/.test(nextChar)) return false;
            }
            this.advance(str.length);
            return true;
        }
        return false;
    }

    expect(str: string): void {
        if (!this.match(str)) {
            throw this.error(`Expected '${str}'`);
        }
    }

    matchAny(...strs: string[]): string | null {
        for (const s of strs) {
            if (this.match(s)) return s;
        }
        return null;
    }

    lookAhead(str: string): boolean {
        this.skipWhitespace();
        if (this.input.startsWith(str, this.pos)) {
            if (/[a-zA-Z_]/.test(str[str.length - 1])) {
                const nextChar = this.input[this.pos + str.length];
                if (nextChar && /[a-zA-Z0-9_]/.test(nextChar)) return false;
            }
            return true;
        }
        return false;
    }

    lookAheadChar(ch: string): boolean {
        this.skipWhitespace();
        return this.peek() === ch;
    }

    readIdentifier(): string {
        this.skipWhitespace();
        // Check for quoted name
        if (this.peek() === "'") {
            return this.readQuotedName();
        }

        let id = '';
        while (!this.eof) {
            const ch = this.peek();
            if (/[a-zA-Z0-9_]/.test(ch)) {
                id += this.advance();
            } else {
                break;
            }
        }
        if (!id) throw this.error('Expected identifier');
        return id;
    }

    readQuotedName(): string {
        this.skipWhitespace();
        if (this.peek() !== "'") throw this.error("Expected quoted name starting with '");
        this.advance(); // skip opening quote
        let name = '';
        while (!this.eof && this.peek() !== "'") {
            name += this.advance();
        }
        if (!this.eof) this.advance(); // skip closing quote
        return name;
    }

    readQualifiedName(): string {
        let name = this.readIdentifier();
        while (this.peek(2) === '::' || this.peek() === '.') {
            if (this.peek(2) === '::') {
                name += this.advance(2);
            } else {
                name += this.advance();
            }
            name += this.readIdentifier();
        }
        return name;
    }

    readMultiplicity(): string | undefined {
        this.skipWhitespace();
        if (this.peek() !== '[') return undefined;
        this.advance(); // [
        let mult = '';
        let depth = 1;
        while (!this.eof && depth > 0) {
            const ch = this.peek();
            if (ch === '[') depth++;
            else if (ch === ']') {
                depth--;
                if (depth === 0) { this.advance(); break; }
            }
            mult += this.advance();
        }
        return mult;
    }

    readBracedContent(): string {
        this.skipWhitespace();
        if (this.peek() !== '{') return '';
        this.advance(); // {
        let content = '';
        let depth = 1;
        while (!this.eof && depth > 0) {
            const ch = this.peek();
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) { this.advance(); break; }
            }
            content += this.advance();
        }
        return content.trim();
    }

    error(message: string): Error {
        const loc = this.position;
        const lineContent = this.input.split('\n')[loc.line - 1] || '';
        return new Error(
            `Parse error at line ${loc.line}, column ${loc.column}: ${message}\n` +
            `  ${lineContent}\n` +
            `  ${' '.repeat(Math.max(0, loc.column - 1))}^`
        );
    }
}

export function parseSysML(input: string): SysMLModel {
    const lexer = new Lexer(input);
    const errors: ParseError[] = [];
    const children: SysMLNode[] = [];

    while (!lexer.eof) {
        lexer.skipWhitespace();
        if (lexer.eof) break;

        try {
            const node = parseElement(lexer);
            if (node) {
                children.push(node);
            }
        } catch (e) {
            const err = e as Error;
            errors.push({
                message: err.message,
                location: {
                    start: lexer.position,
                    end: lexer.position,
                },
            });
            // Skip to next semicolon or closing brace to recover
            skipToRecovery(lexer);
        }
    }

    return { children, errors };
}

function skipToRecovery(lexer: Lexer) {
    let depth = 0;
    while (!lexer.eof) {
        const ch = lexer.peek();
        if (ch === '{') { depth++; lexer.advance(); }
        else if (ch === '}') {
            if (depth === 0) { lexer.advance(); return; }
            depth--;
            lexer.advance();
            if (depth === 0) return;
        }
        else if (ch === ';' && depth === 0) { lexer.advance(); return; }
        else { lexer.advance(); }
    }
}

function parseElement(lexer: Lexer): SysMLNode | null {
    lexer.skipWhitespace();
    if (lexer.eof) return null;

    const start = lexer.position;

    // Check visibility
    let visibility: 'public' | 'private' | 'protected' | undefined;
    if (lexer.lookAhead('private')) { lexer.match('private'); visibility = 'private'; }
    else if (lexer.lookAhead('public')) { lexer.match('public'); visibility = 'public'; }
    else if (lexer.lookAhead('protected')) { lexer.match('protected'); visibility = 'protected'; }

    // Try to parse each element type
    let node: SysMLNode | null = null;

    if (lexer.lookAhead('package')) {
        node = parsePackage(lexer);
    } else if (lexer.lookAhead('part def')) {
        node = parsePartDef(lexer);
    } else if (lexer.lookAhead('part')) {
        node = parsePartUsage(lexer);
    } else if (lexer.lookAhead('port def')) {
        node = parsePortDef(lexer);
    } else if (lexer.lookAhead('port')) {
        node = parsePortUsage(lexer);
    } else if (lexer.lookAhead('connection def')) {
        node = parseConnectionDef(lexer);
    } else if (lexer.lookAhead('connection') || lexer.lookAhead('connect')) {
        node = parseConnectionUsage(lexer);
    } else if (lexer.lookAhead('interface def')) {
        node = parseInterfaceDef(lexer);
    } else if (lexer.lookAhead('interface')) {
        node = parseInterfaceUsage(lexer);
    } else if (lexer.lookAhead('action def')) {
        node = parseActionDef(lexer);
    } else if (lexer.lookAhead('action')) {
        node = parseActionUsage(lexer);
    } else if (lexer.lookAhead('state def')) {
        node = parseStateDef(lexer);
    } else if (lexer.lookAhead('state')) {
        node = parseStateUsage(lexer);
    } else if (lexer.lookAhead('transition')) {
        node = parseTransition(lexer);
    } else if (lexer.lookAhead('requirement def')) {
        node = parseRequirementDef(lexer);
    } else if (lexer.lookAhead('requirement')) {
        node = parseRequirementUsage(lexer);
    } else if (lexer.lookAhead('constraint def')) {
        node = parseConstraintDef(lexer);
    } else if (lexer.lookAhead('require constraint') || lexer.lookAhead('assume constraint') || lexer.lookAhead('constraint')) {
        node = parseConstraintUsage(lexer);
    } else if (lexer.lookAhead('attribute def') || lexer.lookAhead('attr def')) {
        node = parseAttributeDef(lexer);
    } else if (lexer.lookAhead('attribute') || lexer.lookAhead('attr')) {
        node = parseAttributeUsage(lexer);
    } else if (lexer.lookAhead('item def')) {
        node = parseItemDef(lexer);
    } else if (lexer.lookAhead('item')) {
        node = parseItemUsage(lexer);
    } else if (lexer.lookAhead('enum def')) {
        node = parseEnumDef(lexer);
    } else if (lexer.lookAhead('enum')) {
        node = parseEnumUsage(lexer);
    } else if (lexer.lookAhead('flow')) {
        node = parseFlow(lexer);
    } else if (lexer.lookAhead('bind')) {
        node = parseBinding(lexer);
    } else if (lexer.lookAhead('import')) {
        node = parseImport(lexer);
    } else if (lexer.lookAhead('doc')) {
        node = parseDoc(lexer);
    } else if (lexer.lookAhead('entry')) {
        node = parseEntryTransition(lexer);
    } else if (lexer.lookAhead('allocation def') || lexer.lookAhead('allocation')) {
        node = parseGenericElement(lexer, lexer.lookAhead('allocation def') ? 'AllocationDef' : 'AllocationUsage');
    } else if (lexer.lookAhead('use case def') || lexer.lookAhead('use case')) {
        node = parseGenericElement(lexer, lexer.lookAhead('use case def') ? 'UseCaseDef' : 'UseCaseUsage');
    } else if (lexer.lookAhead('viewpoint def')) {
        node = parseViewpointDef(lexer);
    } else if (lexer.lookAhead('viewpoint')) {
        node = parseViewpointUsage(lexer);
    } else if (lexer.lookAhead('view def')) {
        node = parseViewDef(lexer);
    } else if (lexer.lookAhead('view')) {
        node = parseViewUsage(lexer);
    } else if (lexer.lookAhead('verification def')) {
        node = parseVerificationDef(lexer);
    } else if (lexer.lookAhead('verification') || lexer.lookAhead('verify')) {
        node = parseVerificationUsage(lexer);
    } else if (lexer.lookAhead('analysis def')) {
        node = parseAnalysisDef(lexer);
    } else if (lexer.lookAhead('analysis')) {
        node = parseAnalysisUsage(lexer);
    } else if (lexer.lookAhead('metadata def')) {
        node = parseMetadataDef(lexer);
    } else if (lexer.lookAhead('enumeration def')) {
        node = parseEnumDef(lexer);
    } else if (lexer.lookAhead('enumeration')) {
        node = parseEnumUsage(lexer);
    } else if (lexer.lookAhead('test case')) {
        node = parseGenericElement(lexer, 'VerificationUsage');
    } else if (lexer.lookAhead('satisfy')) {
        node = parseSatisfyUsage(lexer);
    } else {
        // Unknown element - try to skip it gracefully
        const word = lexer.readIdentifier();
        node = parseGenericAfterKeyword(lexer, word);
    }

    if (node) {
        node.visibility = visibility;
        node.location = {
            start,
            end: lexer.position,
        };
    }

    return node;
}

function parsePackage(lexer: Lexer): Package {
    lexer.expect('package');
    const name = lexer.readIdentifier();
    const children = parseBody(lexer);
    return { kind: 'Package', name, children };
}

function parsePartDef(lexer: Lexer): PartDef {
    lexer.expect('part');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);

    const superTypes: string[] = [];
    if (lexer.match(':>')) {
        superTypes.push(lexer.readQualifiedName());
        while (lexer.match(',')) {
            superTypes.push(lexer.readQualifiedName());
        }
    }

    const children = parseBody(lexer);
    return { kind: 'PartDef', name, shortName, superTypes, children };
}

function parsePartUsage(lexer: Lexer): PartUsage {
    lexer.expect('part');

    let isRedefine = false;
    if (lexer.match('redefines')) {
        isRedefine = true;
    }

    const name = lexer.readIdentifier();
    const multiplicity = lexer.readMultiplicity();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    // Read multiplicity after type if present
    const mult2 = lexer.readMultiplicity();

    const children = parseBody(lexer);
    return {
        kind: 'PartUsage',
        name,
        typeName,
        multiplicity: mult2 || multiplicity,
        isRedefine,
        children,
    };
}

function parsePortDef(lexer: Lexer): PortDef {
    lexer.expect('port');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);

    const superTypes: string[] = [];
    if (lexer.match(':>')) {
        superTypes.push(lexer.readQualifiedName());
        while (lexer.match(',')) {
            superTypes.push(lexer.readQualifiedName());
        }
    }

    const children = parseBody(lexer);
    return { kind: 'PortDef', name, shortName, superTypes, children };
}

function parsePortUsage(lexer: Lexer): PortUsage {
    lexer.expect('port');

    let direction: 'in' | 'out' | 'inout' | undefined;
    if (lexer.match('inout')) direction = 'inout';
    else if (lexer.match('in')) direction = 'in';
    else if (lexer.match('out')) direction = 'out';

    let isConjugated = false;
    if (lexer.match('~')) isConjugated = true;

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'PortUsage', name, typeName, direction, isConjugated, children };
}

function parseConnectionDef(lexer: Lexer): ConnectionDef {
    lexer.expect('connection');
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);
    const children: SysMLNode[] = [];
    const ends: EndFeature[] = [];

    if (lexer.lookAheadChar('{')) {
        lexer.expect('{');
        while (!lexer.eof && !lexer.lookAheadChar('}')) {
            lexer.skipWhitespace();
            if (lexer.lookAhead('end')) {
                lexer.match('end');
                const mult = lexer.readMultiplicity();
                lexer.matchAny('part', 'port');
                const eName = lexer.readIdentifier();
                let eType = '';
                if (lexer.match(':')) {
                    eType = lexer.readQualifiedName();
                }
                lexer.match(';');
                ends.push({ name: eName, typeName: eType, multiplicity: mult });
            } else {
                const child = parseElement(lexer);
                if (child) children.push(child);
            }
        }
        lexer.match('}');
    } else {
        lexer.match(';');
    }

    return { kind: 'ConnectionDef', name, ends, children };
}

function parseConnectionUsage(lexer: Lexer): ConnectionUsage {
    const isConnect = lexer.match('connect');
    if (!isConnect) lexer.expect('connection');

    let typeName: string | undefined;
    let name = '';

    if (!isConnect) {
        if (lexer.match(':')) {
            typeName = lexer.readQualifiedName();
        } else if (!lexer.lookAheadChar('{') && !lexer.lookAhead('connect')) {
            name = lexer.readIdentifier();
            if (lexer.match(':')) {
                typeName = lexer.readQualifiedName();
            }
        }
    }

    // Parse "connect ... to ..." pattern
    let source = '', target = '';
    let sourceMult = '', targetMult = '';

    if (isConnect || lexer.match('connect')) {
        const sm = lexer.readMultiplicity();
        if (sm) sourceMult = sm;
        // Read source reference  
        let src = '';
        if (lexer.lookAhead('bead') || !lexer.lookAhead('to')) {
            src = readReference(lexer);
        }
        source = src;

        lexer.expect('to');

        const tm = lexer.readMultiplicity();
        if (tm) targetMult = tm;
        target = readReference(lexer);
    }

    const children = parseBody(lexer);

    return {
        kind: 'ConnectionUsage',
        name: name || `${source}_to_${target}`,
        typeName,
        source,
        target,
        sourceMultiplicity: sourceMult,
        targetMultiplicity: targetMult,
        children,
    };
}

function parseInterfaceDef(lexer: Lexer): InterfaceDef {
    lexer.expect('interface');
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);
    const children: SysMLNode[] = [];
    const ends: EndFeature[] = [];

    if (lexer.lookAheadChar('{')) {
        lexer.expect('{');
        while (!lexer.eof && !lexer.lookAheadChar('}')) {
            lexer.skipWhitespace();
            if (lexer.lookAhead('end')) {
                lexer.match('end');
                const mult = lexer.readMultiplicity();
                lexer.matchAny('part', 'port');
                const eName = lexer.readIdentifier();
                let eType = '';
                if (lexer.match(':')) {
                    eType = lexer.readQualifiedName();
                }
                lexer.match(';');
                ends.push({ name: eName, typeName: eType, multiplicity: mult });
            } else {
                const child = parseElement(lexer);
                if (child) children.push(child);
            }
        }
        lexer.match('}');
    } else {
        lexer.match(';');
    }

    return { kind: 'InterfaceDef', name, ends, children };
}

function parseInterfaceUsage(lexer: Lexer): SysMLNode {
    lexer.expect('interface');

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'InterfaceUsage', name, typeName, children } as SysMLNode;
}

function parseActionDef(lexer: Lexer): ActionDef {
    lexer.expect('action');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const params = parseActionParams(lexer);
    const children = parseBody(lexer);

    // Extract params from children if they were parsed as nested
    return { kind: 'ActionDef', name, shortName, params, children };
}

function parseActionUsage(lexer: Lexer): ActionUsage {
    lexer.expect('action');

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const params = parseActionParams(lexer);
    const children = parseBody(lexer);

    return { kind: 'ActionUsage', name, typeName, params, children };
}

function parseActionParams(_lexer: Lexer): ActionParam[] {
    const params: ActionParam[] = [];
    // Params are parsed from the body as "in name : Type;" / "out name : Type;"
    return params;
}

function parseStateDef(lexer: Lexer): StateDef {
    lexer.expect('state');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    return { kind: 'StateDef', name, shortName, children };
}

function parseStateUsage(lexer: Lexer): StateUsage {
    lexer.expect('state');

    let isParallel = false;
    if (lexer.match('parallel')) isParallel = true;

    const name = lexer.readIdentifier();
    const children = parseBody(lexer);

    return { kind: 'StateUsage', name, isParallel, children };
}

function parseTransition(lexer: Lexer): TransitionUsage {
    lexer.expect('transition');

    const name = lexer.readIdentifier();

    let source = '';
    if (lexer.match('first')) {
        source = lexer.readIdentifier();
    }

    let trigger: string | undefined;
    if (lexer.match('accept')) {
        trigger = lexer.readIdentifier();
    }

    let guard: string | undefined;
    if (lexer.match('if')) {
        guard = lexer.readBracedContent();
    }

    let effectAction: string | undefined;
    if (lexer.match('do')) {
        effectAction = lexer.readIdentifier();
    }

    let target = '';
    if (lexer.match('then')) {
        target = lexer.readIdentifier();
    }

    lexer.match(';');

    return {
        kind: 'TransitionUsage',
        name,
        source,
        trigger,
        guard,
        target,
        effectAction,
        children: [],
    };
}

function parseEntryTransition(lexer: Lexer): TransitionUsage {
    lexer.expect('entry');
    lexer.match(';');

    let target = '';
    if (lexer.match('then')) {
        target = lexer.readIdentifier();
        lexer.match(';');
    }

    return {
        kind: 'TransitionUsage',
        name: 'entry',
        source: '__initial__',
        target,
        children: [],
    };
}

function parseRequirementDef(lexer: Lexer): RequirementDef {
    lexer.expect('requirement');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);

    const superTypes: string[] = [];
    if (lexer.match(':>')) {
        superTypes.push(lexer.readQualifiedName());
        while (lexer.match(',')) {
            superTypes.push(lexer.readQualifiedName());
        }
    }

    const children = parseBody(lexer);

    // Extract doc and subject from children
    let doc: string | undefined;
    let subject: { name: string; typeName: string } | undefined;

    for (const child of children) {
        if (child.kind === 'Doc') {
            doc = (child as DocNode).text;
        }
    }

    return { kind: 'RequirementDef', name, shortName, superTypes, doc, subject, children };
}

function parseRequirementUsage(lexer: Lexer): RequirementUsage {
    lexer.expect('requirement');

    const { name, shortName } = parseNameWithShortName(lexer);

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);

    let doc: string | undefined;
    for (const child of children) {
        if (child.kind === 'Doc') {
            doc = (child as DocNode).text;
        }
    }

    return { kind: 'RequirementUsage', name, shortName, typeName, doc, children };
}

function parseConstraintDef(lexer: Lexer): ConstraintDef {
    lexer.expect('constraint');
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    return { kind: 'ConstraintDef', name, children };
}

function parseConstraintUsage(lexer: Lexer): ConstraintUsage {
    const isRequire = lexer.match('require');
    const isAssume = !isRequire && lexer.match('assume');

    lexer.expect('constraint');

    let name = '';
    let expression = '';

    if (lexer.lookAheadChar('{')) {
        expression = lexer.readBracedContent();
    } else {
        name = lexer.readIdentifier();
        if (lexer.lookAheadChar('{')) {
            expression = lexer.readBracedContent();
        }
    }

    lexer.match(';');

    return {
        kind: 'ConstraintUsage',
        name: name || (isRequire ? 'require' : isAssume ? 'assume' : 'constraint'),
        expression,
        isRequire: isRequire || undefined,
        isAssume: isAssume || undefined,
        children: [],
    };
}

function parseAttributeDef(lexer: Lexer): AttributeDef {
    lexer.matchAny('attribute', 'attr');
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    return { kind: 'AttributeDef', name, children };
}

function parseAttributeUsage(lexer: Lexer): AttributeUsage {
    lexer.matchAny('attribute', 'attr');

    let isRedefine = false;
    if (lexer.match('redefines')) {
        isRedefine = true;
    }

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    let defaultValue: string | undefined;
    if (lexer.match('=')) {
        // Read until ; or }
        let val = '';
        while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('}')) {
            val += lexer.advance();
        }
        defaultValue = val.trim();
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name,
        typeName,
        defaultValue,
        isRedefine,
        children: [],
    };
}

function parseItemDef(lexer: Lexer): ItemDef {
    lexer.expect('item');
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);

    const superTypes: string[] = [];
    if (lexer.match(':>')) {
        superTypes.push(lexer.readQualifiedName());
    }

    const children = parseBody(lexer);
    return { kind: 'ItemDef', name, superTypes, children };
}

function parseItemUsage(lexer: Lexer): ItemUsage {
    lexer.expect('item');

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'ItemUsage', name, typeName, children };
}

function parseEnumDef(lexer: Lexer): EnumDef {
    lexer.expect('enum');
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    return { kind: 'EnumDef', name, children };
}

function parseEnumUsage(lexer: Lexer): SysMLNode {
    lexer.expect('enum');
    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'EnumUsage', name, typeName, children } as SysMLNode;
}

function parseFlow(lexer: Lexer): FlowUsage {
    lexer.expect('flow');

    let source = '', target = '';

    if (lexer.match('from')) {
        source = readReference(lexer);
    }

    if (lexer.match('to')) {
        target = readReference(lexer);
    }

    lexer.match(';');

    return { kind: 'FlowUsage', name: `flow_${source}_to_${target}`, source, target, children: [] };
}

function parseBinding(lexer: Lexer): BindingUsage {
    lexer.expect('bind');

    const source = readReference(lexer);
    lexer.expect('=');
    const target = readReference(lexer);

    lexer.match(';');

    return { kind: 'BindingUsage', name: `bind_${source}_${target}`, source, target, children: [] };
}

function parseImport(lexer: Lexer): ImportNode {
    lexer.expect('import');

    let isAll = false;

    const path = lexer.readQualifiedName();

    // Check for ::* wildcard
    if (path.endsWith('*')) {
        isAll = true;
    }

    lexer.match(';');

    return {
        kind: 'Import',
        name: path,
        importPath: path,
        isAll,
        children: [],
    };
}

function parseDoc(lexer: Lexer): DocNode {
    lexer.expect('doc');
    lexer.skipWhitespace();

    let text = '';
    if (lexer.peek(2) === '/*') {
        lexer.advance(2);
        while (!lexer.eof && lexer.peek(2) !== '*/') {
            text += lexer.advance();
        }
        if (!lexer.eof) lexer.advance(2);
    }

    return { kind: 'Doc', name: 'doc', text: text.trim(), children: [] };
}

function parseGenericElement(lexer: Lexer, kind: string): SysMLNode {
    // Consume keyword(s)
    while (!lexer.eof && !lexer.lookAheadChar('{') && !lexer.lookAheadChar(';')) {
        if (lexer.lookAheadChar("'")) {
            lexer.readQuotedName();
            break;
        }
        const id = lexer.readIdentifier();
        if (lexer.lookAheadChar(':') || lexer.lookAheadChar('{') || lexer.lookAheadChar(';')) {
            const children = parseBody(lexer);
            return { kind: kind as any, name: id, children };
        }
    }
    const children = parseBody(lexer);
    return { kind: kind as any, name: '', children };
}

function parseGenericAfterKeyword(lexer: Lexer, keyword: string): SysMLNode {
    // Try to handle unknown keywords gracefully
    if (lexer.lookAheadChar('{')) {
        const children = parseBody(lexer);
        return { kind: 'Unknown', name: keyword, children };
    }
    if (lexer.lookAheadChar(';')) {
        lexer.match(';');
        return { kind: 'Unknown', name: keyword, children: [] };
    }
    // Read until end of line or semicolon
    while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        lexer.advance();
    }
    if (lexer.lookAheadChar('{')) {
        const children = parseBody(lexer);
        return { kind: 'Unknown', name: keyword, children };
    }
    lexer.match(';');
    return { kind: 'Unknown', name: keyword, children: [] };
}

function parseNameWithShortName(lexer: Lexer): { name: string; shortName?: string } {
    lexer.skipWhitespace();

    let shortName: string | undefined;

    // Check for short name <'id'>
    if (lexer.lookAheadChar('<')) {
        lexer.advance(); // <
        if (lexer.peek() === "'") {
            shortName = lexer.readQuotedName();
        } else {
            shortName = lexer.readIdentifier();
        }
        lexer.expect('>');
    }

    const name = lexer.readIdentifier();

    return { name, shortName };
}

function parseBody(lexer: Lexer): SysMLNode[] {
    lexer.skipWhitespace();

    if (lexer.lookAheadChar(';')) {
        lexer.advance();
        return [];
    }

    if (!lexer.lookAheadChar('{')) {
        return [];
    }

    lexer.expect('{');
    const children: SysMLNode[] = [];

    while (!lexer.eof && !lexer.lookAheadChar('}')) {
        lexer.skipWhitespace();
        if (lexer.lookAheadChar('}')) break;

        try {
            // Handle special inline patterns
            if (lexer.lookAhead('in ') || lexer.lookAhead('out ') || lexer.lookAhead('inout ')) {
                const param = parseInlineParam(lexer);
                if (param) {
                    children.push(param);
                    continue;
                }
            }

            if (lexer.lookAhead('subject')) {
                const subj = parseSubject(lexer);
                if (subj) {
                    children.push(subj);
                    continue;
                }
            }

            const child = parseElement(lexer);
            if (child) {
                children.push(child);
            }
        } catch (e) {
            skipToRecovery(lexer);
        }
    }

    lexer.match('}');
    return children;
}

function parseInlineParam(lexer: Lexer): SysMLNode | null {
    let direction: 'in' | 'out' | 'inout' = 'in';
    if (lexer.match('inout')) direction = 'inout';
    else if (lexer.match('out')) direction = 'out';
    else if (lexer.match('in')) direction = 'in';

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name,
        typeName,
        children: [],
        visibility: undefined,
        direction,
    } as any;
}

function parseSubject(lexer: Lexer): SysMLNode | null {
    lexer.expect('subject');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name: `subject:${name}`,
        typeName,
        children: [],
    } as any;
}

function readReference(lexer: Lexer): string {
    lexer.skipWhitespace();
    let ref = '';

    if (lexer.lookAhead('references')) {
        lexer.match('references');
    }

    ref = lexer.readQualifiedName();
    return ref;
}

function parseViewpointDef(lexer: Lexer): SysMLNode {
    lexer.expect('viewpoint');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    const concerns: string[] = [];
    for (const child of children) {
        if (child.kind === 'AttributeUsage' && child.name === 'concerns') {
            const val = (child as any).defaultValue;
            if (val) concerns.push(val);
        }
    }

    return {
        kind: 'ViewpointDef',
        name,
        shortName,
        concerns,
        children,
    } as SysMLNode;
}

function parseViewpointUsage(lexer: Lexer): SysMLNode {
    lexer.expect('viewpoint');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'ViewpointUsage', name, typeName, children } as SysMLNode;
}

function parseViewDef(lexer: Lexer): SysMLNode {
    lexer.expect('view');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);

    let viewpoint: string | undefined;
    if (lexer.match(':')) {
        viewpoint = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'ViewDef', name, shortName, viewpoint, children } as SysMLNode;
}

function parseViewUsage(lexer: Lexer): SysMLNode {
    lexer.expect('view');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'ViewUsage', name, typeName, children } as SysMLNode;
}

function parseVerificationDef(lexer: Lexer): SysMLNode {
    lexer.expect('verification');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    let subject: { name: string; typeName?: string } | undefined;
    for (const child of children) {
        if (child.name.startsWith('subject:')) {
            subject = {
                name: child.name.replace('subject:', ''),
                typeName: (child as any).typeName,
            };
        }
    }

    return { kind: 'VerificationDef', name, shortName, subject, children } as SysMLNode;
}

function parseVerificationUsage(lexer: Lexer): SysMLNode {
    if (lexer.match('verify')) {
        const name = lexer.readIdentifier();
        let typeName: string | undefined;
        if (lexer.match(':')) {
            typeName = lexer.readQualifiedName();
        }
        const children = parseBody(lexer);
        return { kind: 'VerificationUsage', name: name || 'verify', typeName, children } as SysMLNode;
    }

    lexer.expect('verification');
    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'VerificationUsage', name, typeName, children } as SysMLNode;
}

function parseAnalysisDef(lexer: Lexer): SysMLNode {
    lexer.expect('analysis');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    return { kind: 'AnalysisDef', name, shortName, children } as SysMLNode;
}

function parseAnalysisUsage(lexer: Lexer): SysMLNode {
    lexer.expect('analysis');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    const children = parseBody(lexer);
    return { kind: 'AnalysisUsage', name, typeName, children } as SysMLNode;
}

function parseMetadataDef(lexer: Lexer): SysMLNode {
    lexer.expect('metadata');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    return { kind: 'MetadataDef', name, shortName, children } as SysMLNode;
}

function parseSatisfyUsage(lexer: Lexer): SysMLNode {
    lexer.expect('satisfy');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = lexer.readQualifiedName();
    }

    lexer.match(';');

    return {
        kind: 'RequirementUsage',
        name: name || 'satisfy',
        typeName,
        children: [],
    } as SysMLNode;
}

export function getNodeDisplayName(node: SysMLNode): string {
    if (node.shortName) return `«${node.shortName}» ${node.name}`;
    return node.name;
}

export function getNodeIcon(kind: string): string {
    const icons: Record<string, string> = {
        Package: '📦',
        PartDef: '🔷',
        PartUsage: '🔹',
        PortDef: '🔌',
        PortUsage: '🔸',
        ConnectionDef: '🔗',
        ConnectionUsage: '🔗',
        InterfaceDef: '🔀',
        InterfaceUsage: '🔀',
        ActionDef: '⚡',
        ActionUsage: '⚡',
        StateDef: '🔄',
        StateUsage: '🔄',
        TransitionUsage: '➡️',
        RequirementDef: '📋',
        RequirementUsage: '📋',
        ConstraintDef: '🔒',
        ConstraintUsage: '🔒',
        AttributeDef: '📝',
        AttributeUsage: '📝',
        ItemDef: '📄',
        ItemUsage: '📄',
        EnumDef: '📊',
        EnumUsage: '📊',
        EnumValueDef: '📊',
        FlowUsage: '↗️',
        BindingUsage: '⇔',
        Import: '📥',
        Comment: '💬',
        Doc: '📖',
        ViewpointDef: '👁️',
        ViewpointUsage: '👁️',
        ViewDef: '🖼️',
        ViewUsage: '🖼️',
        VerificationDef: '✅',
        VerificationUsage: '✅',
        AnalysisDef: '📊',
        AnalysisUsage: '📊',
        MetadataDef: '🏷️',
        AllocationDef: '↔️',
        AllocationUsage: '↔️',
        UseCaseDef: '📝',
        UseCaseUsage: '📝',
    };
    return icons[kind] || '❓';
}
