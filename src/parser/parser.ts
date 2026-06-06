/**
 * SysML v2 Textual Notation Parser
 * 
 * A recursive-descent parser that converts SysML v2 textual notation
 * into a structured AST (Abstract Syntax Tree).
 * 
 * Feature Support Matrix:
 * ✅ Package, PartDef, PartUsage, PortDef, PortUsage
 * ✅ ConnectionDef, ConnectionUsage, InterfaceDef, InterfaceUsage
 * ✅ ActionDef, ActionUsage (including perform action)
 * ✅ StateDef, StateUsage, TransitionUsage (including entry, first..then)
 * ✅ RequirementDef, RequirementUsage (including satisfy, verify)
 * ✅ ConstraintDef, ConstraintUsage (including require/assume constraint)
 * ✅ AttributeDef, AttributeUsage (including attr shorthand)
 * ✅ ItemDef, ItemUsage, EnumDef, EnumUsage, EnumValueDef
 * ✅ FlowUsage, BindingUsage, Import, Doc
 * ✅ ViewpointDef, ViewpointUsage, ViewDef, ViewUsage
 * ✅ VerificationDef, VerificationUsage (including verify shorthand)
 * ✅ AnalysisDef, AnalysisUsage (including return shorthand)
 * ✅ MetadataDef, AllocationDef, AllocationUsage, DependencyUsage
 * ✅ UseCaseDef, UseCaseUsage (including include/extend)
 * ✅ Static/abstract modifiers and redefinition shorthand
 * ⚠️  Action params: parsed from body as inline params, not from signature
 * ⚠️  Doc comments: detected by heuristic (preceding 'doc' keyword), may miss edge cases
 * ⚠️  Block comments: nested block comments supported
 * ⚠️  Alias definitions and first-tranche MoC constructs recover as typed nodes
 * ⚠️  Calc, individual, occurrence, snapshot/time slice, variation, metadata about, message/event
 */

import type {
    SysMLNode,
    SysMLModel,
    ParseError,
    SourceLocation,
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
    UseCaseDef,
    UseCaseUsage,
    AllocationDef,
    AllocationUsage,
    DependencyUsage,
    NodeKind,
} from './types';
import { nodeProperties } from '../utils/nodeProperties';

const ELEMENT_START_PATTERN = /^(part|port|action|state|requirement|constraint|attribute|item|enum|package|connection|interface|transition|flow|bind|import|doc|entry|exit|private|public|protected|perform|first|then|succession|view|viewpoint|verification|analysis|metadata|allocate|dependency|use|case|satisfy|verify|include|extend|test|alias|calc|individual|occurrence|snapshot|timeslice|time|variation|variant|send|accept|event)$/;

class Lexer {
    private pos = 0;
    private line = 1;
    private col = 1;
    private input: string;
    private diagnostics: ParseError[];

    constructor(input: string, diagnostics: ParseError[] = []) {
        this.input = input;
        this.diagnostics = diagnostics;
    }

    get position() {
        return { line: this.line, column: this.col, offset: this.pos };
    }

    get currentLine() {
        return this.line;
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
                const beforeComment = this.input.slice(Math.max(0, this.pos - 10), this.pos).trimEnd();
                if (beforeComment.endsWith('doc')) {
                    break;
                }
                this.advance(2);
                let depth = 1;
                while (!this.eof && depth > 0) {
                    if (this.peek(2) === '/*') {
                        depth++;
                        this.advance(2);
                    } else if (this.peek(2) === '*/') {
                        depth--;
                        this.advance(2);
                    } else {
                        this.advance();
                    }
                }
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
        this.enterBrace();
        let content = '';
        let depth = 1;
        while (!this.eof && depth > 0) {
            const ch = this.peek();
            if (ch === '{') { depth++; this.enterBrace(); }
            else if (ch === '}') {
                depth--;
                this.exitBrace();
                if (depth === 0) { this.advance(); break; }
            }
            content += this.advance();
        }
        return content.trim();
    }

    private braceDepth = 0;

    enterBrace() { this.braceDepth++; }
    exitBrace() { this.braceDepth = Math.max(0, this.braceDepth - 1); }

    error(message: string): Error {
        return this.errorWithSeverity(message, 'error');
    }

    errorWithSeverity(message: string, severity: 'error' | 'warning' | 'info'): Error {
        const loc = this.position;
        const lines = this.input.split('\n');
        const lineContent = lines[loc.line - 1] || '';
        const suggestion = this.suggestCorrection();
        const suggestionText = suggestion ? `\n  Did you mean: ${suggestion}?` : '';
        const context = this.extractContext(loc.line);
        const severityLabel = severity === 'error' ? 'Error' : severity === 'warning' ? 'Warning' : 'Info';
        return new Error(
            `[${severityLabel}] Parse error at line ${loc.line}, column ${loc.column}: ${message}\n` +
            `  ${lineContent}\n` +
            `  ${' '.repeat(Math.max(0, loc.column - 1))}^${suggestionText}\n` +
            `${context}`
        );
    }

    reportDiagnostic(
        message: string,
        severity: 'error' | 'warning' | 'info',
        code: string,
        start = this.position,
        end = this.position,
        suggestion?: string
    ): void {
        this.diagnostics.push({
            message,
            location: { start, end },
            severity,
            code,
            suggestion,
            context: this.extractContext(start.line),
        });
    }

    private extractContext(errorLine: number): string {
        const lines = this.input.split('\n');
        const start = Math.max(0, errorLine - 3);
        const end = Math.min(lines.length, errorLine + 2);
        const contextLines: string[] = [];
        for (let i = start; i < end; i++) {
            const lineNum = i + 1;
            const marker = lineNum === errorLine ? '>' : ' ';
            contextLines.push(`${marker} ${lineNum.toString().padStart(4, ' ')} | ${lines[i]}`);
        }
        return contextLines.length > 0 ? `Context:\n${contextLines.join('\n')}` : '';
    }

    suggestCorrection(): string | null {
        const remaining = this.remaining.trimStart();
        const corrections: [string, string][] = [
            ['partdef ', 'part def '],
            ['portdef ', 'port def '],
            ['actiondef ', 'action def '],
            ['statedef ', 'state def '],
            ['requirementdef ', 'requirement def '],
            ['constraintdef ', 'constraint def '],
            ['connectiondef ', 'connection def '],
            ['interfacedef ', 'interface def '],
            ['attributedef ', 'attribute def '],
            ['itemdef ', 'item def '],
            ['enumdef ', 'enum def '],
        ];
        const lower = remaining.toLowerCase();
        for (const [wrong, right] of corrections) {
            if (lower.startsWith(wrong)) {
                return `'${right.trimEnd()}' instead of '${wrong.trimEnd()}'`;
            }
        }

        // Detect missing semicolon at end of line
        const currentLine = this.input.split('\n')[this.line - 1] || '';
        const trimmed = currentLine.trim();
        if (trimmed && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
            const nextTok = remaining.split(/\s/)[0];
            if (nextTok && ELEMENT_START_PATTERN.test(nextTok)) {
                return `add ';' at end of line`;
            }
        }

        // Detect unmatched opening brace at EOF
        if (this.eof && this.braceDepth > 0) {
            return `close ${this.braceDepth} unmatched opening brace(s) with '}'`;
        }

        return null;
    }
}

export function parseSysML(input: string): SysMLModel {
    const errors: ParseError[] = [];
    const lexer = new Lexer(input, errors);
    const children: SysMLNode[] = [];

    while (!lexer.eof) {
        lexer.skipWhitespace();
        if (lexer.eof) break;

        const lineBefore = lexer.currentLine;
        try {
            const node = parseElement(lexer);
            if (node) {
                children.push(node);
            }
            // Check for missing semicolon between elements on the same line
            const lineAfter = lexer.currentLine;
            if (lineAfter === lineBefore) {
                lexer.skipWhitespace();
                if (!lexer.eof) {
                    const remaining = lexer.remaining.trimStart();
                    const nextTok = remaining.split(/\s/)[0];
                    if (nextTok && ELEMENT_START_PATTERN.test(nextTok)) {
                        const currentLineText = input.split('\n')[lineAfter - 1] || '';
                        const trimmed = currentLineText.trim();
                        if (trimmed && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}')) {
                            const suggestion = `add ';' at end of line`;
                            errors.push({
                                message: `Missing semicolon before '${nextTok}'`,
                                location: {
                                    start: lexer.position,
                                    end: lexer.position,
                                },
                                severity: 'error',
                                suggestion,
                                context: lexer['extractContext'](lineAfter),
                            });
                        }
                    }
                }
            }
        } catch (e) {
            const err = e as Error;
            const parsedSeverity = parseSeverityFromMessage(err.message);
            const suggestion = extractSuggestionFromMessage(err.message);
            const context = extractContextFromMessage(err.message);
            errors.push({
                message: stripSeverityPrefix(err.message),
                location: {
                    start: lexer.position,
                    end: lexer.position,
                },
                severity: parsedSeverity,
                suggestion,
                context,
            });
            // Skip to next semicolon or closing brace to recover
            skipToRecovery(lexer);
        }
    }

    // Check for unmatched braces at EOF
    if (lexer['braceDepth'] > 0) {
        const suggestion = `close ${lexer['braceDepth']} unmatched opening brace(s) with '}'`;
        errors.push({
            message: `Unmatched opening brace at end of file`,
            location: {
                start: lexer.position,
                end: lexer.position,
            },
            severity: 'error',
            suggestion,
            context: lexer['extractContext'](lexer.position.line),
        });
    }

    return { children, errors };
}

function parseSeverityFromMessage(message: string): 'error' | 'warning' | 'info' {
    const m = message.match(/^\[(Error|Warning|Info)\]/);
    if (m) {
        const s = m[1].toLowerCase();
        if (s === 'warning' || s === 'info') return s;
    }
    return 'error';
}

function stripSeverityPrefix(message: string): string {
    return message.replace(/^\[(Error|Warning|Info)\]\s*/, '');
}

function extractSuggestionFromMessage(message: string): string | undefined {
    const m = message.match(/Did you mean: (.+)\?/) || message.match(/Did you mean '(.+)'\?/);
    return m ? m[1] : undefined;
}

function extractContextFromMessage(message: string): string | undefined {
    const idx = message.indexOf('Context:\n');
    if (idx >= 0) {
        return message.slice(idx + 'Context:\n'.length);
    }
    return undefined;
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

    const modifiers: string[] = [];
    while (lexer.lookAhead('abstract') || lexer.lookAhead('static')) {
        modifiers.push(lexer.readIdentifier());
    }

    // Try to parse each element type
    let node: SysMLNode | null = null;

    if (lexer.lookAheadChar('@')) {
        node = parseMetadataAnnotation(lexer);
    } else if (lexer.lookAhead('package')) {
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
    } else if (lexer.lookAhead('perform action')) {
        node = parsePerformActionUsage(lexer);
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
    } else if (lexer.lookAhead('succession')) {
        node = parseSuccession(lexer);
    } else if (lexer.lookAhead('first')) {
        node = parseFirstThenSuccession(lexer);
    } else if (lexer.lookAhead('flow')) {
        node = parseFlow(lexer);
    } else if (lexer.lookAhead('bind')) {
        node = parseBinding(lexer);
    } else if (lexer.lookAhead('alias')) {
        node = parseAlias(lexer);
    } else if (lexer.lookAhead('import')) {
        node = parseImport(lexer);
    } else if (lexer.lookAhead('doc')) {
        node = parseDoc(lexer);
    } else if (lexer.lookAhead('entry')) {
        node = parseEntryTransition(lexer);
    } else if (lexer.lookAhead('allocation def')) {
        node = parseAllocationDef(lexer);
    } else if (lexer.lookAhead('allocate') || lexer.lookAhead('allocation')) {
        node = parseAllocationUsage(lexer);
    } else if (lexer.lookAhead('dependency')) {
        node = parseDependencyUsage(lexer);
    } else if (lexer.lookAhead('use case def')) {
        node = parseUseCaseDef(lexer);
    } else if (lexer.lookAhead('include use case')) {
        node = parseUseCaseUsage(lexer, 'include');
    } else if (lexer.lookAhead('extend use case')) {
        node = parseUseCaseUsage(lexer, 'extend');
    } else if (lexer.lookAhead('use case')) {
        node = parseUseCaseUsage(lexer, 'normal');
    } else if (lexer.lookAhead('viewpoint def')) {
        node = parseViewpointDef(lexer);
    } else if (lexer.lookAhead('viewpoint')) {
        node = parseViewpointUsage(lexer);
    } else if (lexer.lookAhead('view def')) {
        node = parseViewDef(lexer);
    } else if (lexer.lookAhead('view')) {
        node = parseViewUsage(lexer);
    } else if (lexer.lookAhead('calc def')) {
        node = parsePartialNamedConstruct(lexer, 'CalcDef', 'calc', ['calc', 'def']);
    } else if (lexer.lookAhead('calc')) {
        node = parsePartialNamedConstruct(lexer, 'CalcUsage', 'calc', ['calc']);
    } else if (lexer.lookAhead('individual def')) {
        node = parsePartialNamedConstruct(lexer, 'IndividualDef', 'individual', ['individual', 'def']);
    } else if (lexer.lookAhead('individual')) {
        node = parsePartialNamedConstruct(lexer, 'IndividualUsage', 'individual', ['individual']);
    } else if (lexer.lookAhead('occurrence def')) {
        node = parsePartialNamedConstruct(lexer, 'OccurrenceDef', 'occurrence', ['occurrence', 'def']);
    } else if (lexer.lookAhead('occurrence')) {
        node = parsePartialNamedConstruct(lexer, 'OccurrenceUsage', 'occurrence', ['occurrence']);
    } else if (lexer.lookAhead('snapshot')) {
        node = parsePartialNamedConstruct(lexer, 'SnapshotUsage', 'snapshot', ['snapshot']);
    } else if (lexer.lookAhead('time slice')) {
        node = parsePartialNamedConstruct(lexer, 'TimeSliceUsage', 'time-slice', ['time', 'slice']);
    } else if (lexer.lookAhead('timeslice')) {
        node = parsePartialNamedConstruct(lexer, 'TimeSliceUsage', 'time-slice', ['timeslice']);
    } else if (lexer.lookAhead('variation def')) {
        node = parsePartialNamedConstruct(lexer, 'VariationDef', 'variation', ['variation', 'def']);
    } else if (lexer.lookAhead('variation')) {
        node = parsePartialNamedConstruct(lexer, 'VariationUsage', 'variation', ['variation']);
    } else if (lexer.lookAhead('variant')) {
        node = parsePartialNamedConstruct(lexer, 'VariantUsage', 'variant', ['variant']);
    } else if (lexer.lookAhead('send') || lexer.lookAhead('accept')) {
        node = parseMessageUsage(lexer);
    } else if (lexer.lookAhead('event occurrence')) {
        node = parsePartialNamedConstruct(lexer, 'EventOccurrenceUsage', 'event-occurrence', ['event', 'occurrence']);
    } else if (lexer.lookAhead('event')) {
        node = parsePartialNamedConstruct(lexer, 'EventOccurrenceUsage', 'event', ['event']);
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
    } else if (lexer.lookAhead('metadata')) {
        node = parseMetadataUsage(lexer);
    } else if (lexer.lookAhead('objective')) {
        node = parseObjectiveUsage(lexer);
    } else if (lexer.lookAhead('enumeration def')) {
        node = parseEnumDef(lexer);
    } else if (lexer.lookAhead('enumeration')) {
        node = parseEnumUsage(lexer);
    } else if (lexer.lookAhead('test case')) {
        node = parseGenericElement(lexer, 'VerificationUsage');
    } else if (lexer.lookAhead('satisfy')) {
        node = parseSatisfyUsage(lexer);
    } else if (lexer.lookAhead('then')) {
        lexer.match('then');
        node = parseElement(lexer);
    } else {
        // Unknown element - check for common misspellings first
        const word = lexer.readIdentifier();
        const corrections: Record<string, string> = {
            partdef: 'part def',
            portdef: 'port def',
            actiondef: 'action def',
            statedef: 'state def',
            requirementdef: 'requirement def',
            constraintdef: 'constraint def',
            connectiondef: 'connection def',
            interfacedef: 'interface def',
            attributedef: 'attribute def',
            itemdef: 'item def',
            enumdef: 'enum def',
        };
        const lower = word.toLowerCase();
        if (corrections[lower]) {
            throw lexer.errorWithSeverity(
                `Unknown keyword '${word}'. Did you mean '${corrections[lower]}'?`,
                'error'
            );
        }
        node = parseGenericAfterKeyword(lexer, word, start);
    }

    if (node) {
        node.visibility = visibility;
        if (modifiers.length > 0) node.modifiers = modifiers;
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
    if (lexer.match('redefines') || lexer.match('override')) {
        isRedefine = true;
    }

    const name = lexer.readIdentifier();
    const multiplicity = lexer.readMultiplicity();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
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
        typeName = readTypeReference(lexer);
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
                    eType = readTypeReference(lexer);
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
            typeName = readTypeReference(lexer);
        } else if (!lexer.lookAheadChar('{') && !lexer.lookAhead('connect')) {
            name = lexer.readIdentifier();
            if (lexer.match(':')) {
                typeName = readTypeReference(lexer);
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
                    eType = readTypeReference(lexer);
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
        typeName = readTypeReference(lexer);
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
        typeName = readTypeReference(lexer);
    }

    const params = parseActionParams(lexer);
    const children = parseBody(lexer);

    return { kind: 'ActionUsage', name, typeName, params, children };
}

function parsePerformActionUsage(lexer: Lexer): ActionUsage {
    lexer.expect('perform');
    lexer.expect('action');

    let name = 'performAction';
    let typeName: string | undefined;

    if (lexer.match(':>>')) {
        name = lexer.readQualifiedName();
    } else if (!lexer.lookAheadChar('{') && !lexer.lookAheadChar(';')) {
        name = lexer.readIdentifier();
        lexer.readMultiplicity(); // optional [*] / [1..*]
    }

    if (lexer.match(':') || lexer.match(':>') || lexer.match(':>>')) {
        typeName = readTypeReference(lexer);
    }

    // Consume trailing qualifiers like "ordered" before body/semicolon.
    while (!lexer.eof && !lexer.lookAheadChar('{') && !lexer.lookAheadChar(';')) {
        if (lexer.lookAhead('ordered') || lexer.lookAhead('nonunique') || lexer.lookAhead('nonUnique')) {
            lexer.readIdentifier();
            continue;
        }
        break;
    }

    const children = parseBody(lexer);
    return { kind: 'ActionUsage', name, typeName, params: [], children };
}

function parseActionParams(_lexer: Lexer): ActionParam[] {
    void _lexer;
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
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
    }
    const children = parseBody(lexer);

    return { kind: 'StateUsage', name, isParallel, typeName, children };
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
        typeName = readTypeReference(lexer);
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
    let multiplicity: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
        multiplicity = lexer.readMultiplicity();
    }

    let defaultValue: string | undefined;
    if (lexer.match('=')) {
        defaultValue = readStatementValue(lexer);
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name,
        typeName,
        multiplicity,
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
        typeName = readTypeReference(lexer);
    }

    const children = parseBody(lexer);
    return { kind: 'ItemUsage', name, typeName, children };
}

function parseEnumDef(lexer: Lexer): EnumDef {
    if (!lexer.matchAny('enum', 'enumeration')) {
        lexer.expect('enum');
    }
    lexer.expect('def');

    const { name } = parseNameWithShortName(lexer);
    const children = parseEnumBody(lexer);

    return { kind: 'EnumDef', name, children };
}

function parseEnumUsage(lexer: Lexer): SysMLNode {
    if (!lexer.matchAny('enum', 'enumeration')) {
        lexer.expect('enum');
    }
    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
    }

    const children = parseBody(lexer);
    return { kind: 'EnumUsage', name, typeName, children } as SysMLNode;
}

function parseEnumBody(lexer: Lexer): SysMLNode[] {
    lexer.skipWhitespace();

    if (lexer.lookAheadChar(';')) {
        lexer.advance();
        return [];
    }

    if (!lexer.lookAheadChar('{')) {
        return [];
    }

    lexer.expect('{');
    lexer.enterBrace();
    const children: SysMLNode[] = [];

    while (!lexer.eof && !lexer.lookAheadChar('}')) {
        lexer.skipWhitespace();
        if (lexer.lookAheadChar('}')) break;

        try {
            if (lexer.lookAhead('doc')) {
                children.push(parseDoc(lexer));
                continue;
            }

            const start = lexer.position;
            const name = lexer.readIdentifier();
            const valueChildren = parseBody(lexer);
            children.push({
                kind: 'EnumValueDef',
                name,
                children: valueChildren,
                location: {
                    start,
                    end: lexer.position,
                },
            });
        } catch {
            skipToRecovery(lexer);
        }
    }

    if (lexer.match('}')) {
        lexer.exitBrace();
    } else {
        throw lexer.errorWithSeverity("Expected '}'", 'error');
    }

    return children;
}

function parseFlow(lexer: Lexer): FlowUsage {
    lexer.expect('flow');

    let source = '', target = '';

    if (lexer.match('from')) {
        source = readReference(lexer);
    } else {
        source = readReference(lexer);
    }

    if (lexer.match('to')) {
        target = readReference(lexer);
    }

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
    }

    lexer.match(';');

    return { kind: 'FlowUsage', name: `flow_${source}_to_${target}`, source, target, typeName, children: [] };
}

function parseBinding(lexer: Lexer): BindingUsage {
    lexer.expect('bind');

    const source = readReference(lexer);
    lexer.expect('=');
    const target = readReference(lexer);

    lexer.match(';');

    return { kind: 'BindingUsage', name: `bind_${source}_${target}`, source, target, children: [] };
}

function parseAlias(lexer: Lexer): SysMLNode {
    lexer.expect('alias');
    const name = lexer.readIdentifier();
    let targetRef = '';
    if (lexer.match('for')) {
        targetRef = lexer.readQualifiedName();
    }
    lexer.match(';');
    return { kind: 'Alias', name, targetRef, children: [] } as SysMLNode;
}

function parsePartialNamedConstruct(
    lexer: Lexer,
    kind: NodeKind,
    code: string,
    keywords: string[],
): SysMLNode {
    const start = lexer.position;
    for (const keyword of keywords) {
        lexer.expect(keyword);
    }

    let name = code;
    if (!lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        name = lexer.readIdentifier();
    }

    let typeName: string | undefined;
    let snapshotOf: string | undefined;
    let timeSliceOf: string | undefined;
    let variantOf: string | undefined;
    let about: string | undefined;

    while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        if (lexer.match(':')) {
            typeName = readTypeReference(lexer);
        } else if (lexer.match('of')) {
            const ref = readReference(lexer);
            if (kind === 'SnapshotUsage') snapshotOf = ref;
            else if (kind === 'TimeSliceUsage') timeSliceOf = ref;
            else if (kind === 'VariantUsage') variantOf = ref;
        } else if (lexer.match('about')) {
            about = readReference(lexer);
        } else {
            lexer.advance();
        }
    }

    const children = parseBody(lexer);
    lexer.reportDiagnostic(
        `Partial support for '${code}' recovered as ${kind}`,
        'warning',
        `unsupported:${code}`,
        start,
        lexer.position
    );

    return {
        kind,
        name,
        typeName,
        snapshotOf,
        timeSliceOf,
        variantOf,
        about,
        children,
    } as SysMLNode;
}

function parseMetadataUsage(lexer: Lexer): SysMLNode {
    const start = lexer.position;
    lexer.expect('metadata');
    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
    }

    let about: string | undefined;
    if (lexer.match('about')) {
        about = readReference(lexer);
    }

    while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        lexer.advance();
    }

    const children = parseBody(lexer);
    lexer.reportDiagnostic(
        about ? "Partial support for metadata 'about' recovered as MetadataUsage" : 'Partial metadata usage support',
        'warning',
        about ? 'unsupported:metadata-about' : 'unsupported:metadata',
        start,
        lexer.position
    );

    return { kind: 'MetadataUsage', name, typeName, about, children } as SysMLNode;
}

function parseMessageUsage(lexer: Lexer): SysMLNode {
    const start = lexer.position;
    const direction = lexer.match('send') ? 'send' : 'accept';
    if (direction === 'accept') {
        lexer.expect('accept');
    }

    let payloadType = '';
    if (!lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        payloadType = readReference(lexer);
    }

    let target: string | undefined;
    if (lexer.match('to')) {
        target = readReference(lexer);
    }

    while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        lexer.advance();
    }

    const children = parseBody(lexer);
    lexer.reportDiagnostic(
        `Partial support for ${direction} message recovered as MessageUsage`,
        'warning',
        'unsupported:message',
        start,
        lexer.position
    );

    return {
        kind: 'MessageUsage',
        name: `${direction}_${payloadType || 'message'}`,
        source: direction,
        target,
        payloadType,
        children,
    } as SysMLNode;
}

function parseSuccession(lexer: Lexer): SysMLNode {
    lexer.expect('succession');

    if (lexer.match('flow')) {
        let source = '';
        let target = '';
        if (lexer.match('from')) {
            source = readReference(lexer);
        } else {
            source = readReference(lexer);
        }
        if (lexer.match('to')) {
            target = readReference(lexer);
        }
        let typeName: string | undefined;
        if (lexer.match(':')) {
            typeName = readTypeReference(lexer);
        }
        lexer.match(';');
        return {
            kind: 'FlowUsage',
            name: `succession_flow_${source}_to_${target}`,
            source,
            target,
            typeName,
            children: [],
        } as FlowUsage;
    }

    let name = 'succession';
    if (!lexer.lookAhead('first') && !lexer.lookAheadChar(';')) {
        name = lexer.readIdentifier();
    }

    let source = '';
    let target = '';
    if (lexer.match('first')) {
        source = readReference(lexer);
    }
    if (lexer.match('then')) {
        target = readReference(lexer);
    }

    lexer.match(';');
    return {
        kind: 'TransitionUsage',
        name,
        source,
        target,
        children: [],
    } as TransitionUsage;
}

function parseFirstThenSuccession(lexer: Lexer): TransitionUsage {
    lexer.expect('first');
    const source = readReference(lexer);
    lexer.expect('then');
    const target = readReference(lexer);
    lexer.match(';');
    return {
        kind: 'TransitionUsage',
        name: 'succession',
        source,
        target,
        children: [],
    };
}

function parseImport(lexer: Lexer): ImportNode {
    lexer.expect('import');

    let isAll = false;

    let path = '';

    const firstPart = lexer.readIdentifier();
    path = firstPart;

    while (lexer.peek(2) === '::') {
        path += lexer.advance(2);
        if (lexer.peek() === '*') {
            path += lexer.advance();
            isAll = true;
            break;
        }
        path += lexer.readIdentifier();
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

    lexer.match(';');

    return { kind: 'Doc', name: 'doc', text: text.trim(), children: [] };
}

function parseGenericElement(lexer: Lexer, kind: NodeKind): SysMLNode {
    // Consume keyword(s)
    while (!lexer.eof && !lexer.lookAheadChar('{') && !lexer.lookAheadChar(';')) {
        if (lexer.lookAheadChar("'")) {
            lexer.readQuotedName();
            break;
        }
        const id = lexer.readIdentifier();
        if (lexer.lookAheadChar(':') || lexer.lookAheadChar('{') || lexer.lookAheadChar(';')) {
            const children = parseBody(lexer);
            return { kind, name: id, children };
        }
    }
    const children = parseBody(lexer);
    return { kind, name: '', children };
}

function parseGenericAfterKeyword(lexer: Lexer, keyword: string, start: SourceLocation['start']): SysMLNode {
    // Try to handle unknown keywords gracefully
    let node: SysMLNode;
    if (lexer.lookAheadChar('{')) {
        const children = parseBody(lexer);
        node = { kind: 'Unknown', name: keyword, children };
    } else if (lexer.lookAheadChar(';')) {
        lexer.match(';');
        node = { kind: 'Unknown', name: keyword, children: [] };
    } else {
        // Read until end of line or semicolon
        while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
            lexer.advance();
        }
        if (lexer.lookAheadChar('{')) {
            const children = parseBody(lexer);
            node = { kind: 'Unknown', name: keyword, children };
        } else {
            lexer.match(';');
            node = { kind: 'Unknown', name: keyword, children: [] };
        }
    }

    const codeKeyword = keyword.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    lexer.reportDiagnostic(
        `Unsupported construct '${keyword}' recovered as Unknown node`,
        'warning',
        `unsupported:${codeKeyword}`,
        start,
        lexer.position
    );
    return node;
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
        // Check for missing semicolon before next keyword on same line
        const lineBefore = lexer.currentLine;
        lexer.skipWhitespace();
        if (!lexer.eof && lexer.currentLine === lineBefore) {
            const remaining = lexer.remaining.trimStart();
            const nextTok = remaining.split(/\s/)[0];
            if (nextTok && ELEMENT_START_PATTERN.test(nextTok)) {
                throw lexer.errorWithSeverity(
                    `Missing semicolon before '${nextTok}'. Did you mean: add ';' at end of line?`,
                    'error'
                );
            }
        }
        return [];
    }

    lexer.expect('{');
    lexer.enterBrace();
    const children: SysMLNode[] = [];

    while (!lexer.eof && !lexer.lookAheadChar('}')) {
        lexer.skipWhitespace();
        if (lexer.lookAheadChar('}')) break;

        const childStart = lexer.position;
        try {
            // Handle special inline patterns
            if (lexer.lookAhead(':>>')) {
                const redefinition = parseRedefinition(lexer);
                if (redefinition) {
                    children.push(redefinition);
                    continue;
                }
            }

            if (lexer.lookAhead('in ') || lexer.lookAhead('out ') || lexer.lookAhead('inout ')) {
                const param = parseInlineParam(lexer);
                if (param) {
                    children.push(param);
                    continue;
                }
            }

            if (lexer.lookAhead('return')) {
                const returnParam = parseReturnParam(lexer);
                if (returnParam) {
                    children.push(returnParam);
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
            const err = e as Error;
            const parsedSeverity = parseSeverityFromMessage(err.message);
            const suggestion = extractSuggestionFromMessage(err.message);
            const message = stripSeverityPrefix(err.message).split('\n')[0];
            lexer.reportDiagnostic(
                `Recovered from nested parse failure: ${message}`,
                parsedSeverity,
                'recovery:nested-parse-failure',
                childStart,
                lexer.position,
                suggestion
            );
            skipToRecovery(lexer);
        }
    }

    if (lexer.match('}')) {
        lexer.exitBrace();
    } else {
        // Missing closing brace - keep braceDepth > 0 so EOF check catches it
        throw lexer.errorWithSeverity("Expected '}'", 'error');
    }
    return children;
}

function parseRedefinition(lexer: Lexer): AttributeUsage | null {
    lexer.expect(':>>');

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    let multiplicity: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
        multiplicity = lexer.readMultiplicity();
    }

    let defaultValue: string | undefined;
    if (lexer.match('=')) {
        defaultValue = readStatementValue(lexer);
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name,
        typeName,
        multiplicity,
        defaultValue,
        isRedefine: true,
        children: [],
    };
}

function parseInlineParam(lexer: Lexer): AttributeUsage | null {
    let direction: 'in' | 'out' | 'inout' = 'in';
    if (lexer.match('inout')) direction = 'inout';
    else if (lexer.match('out')) direction = 'out';
    else if (lexer.match('in')) direction = 'in';

    const name = lexer.readIdentifier();

    let typeName: string | undefined;
    let multiplicity: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
        multiplicity = lexer.readMultiplicity();
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name,
        typeName,
        multiplicity,
        children: [],
        visibility: undefined,
        direction,
    };
}

function parseReturnParam(lexer: Lexer): AttributeUsage | null {
    lexer.expect('return');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    let multiplicity: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
        multiplicity = lexer.readMultiplicity();
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name,
        typeName,
        multiplicity,
        direction: 'out',
        children: [],
    };
}

function parseSubject(lexer: Lexer): AttributeUsage | null {
    lexer.expect('subject');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    let multiplicity: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
        multiplicity = lexer.readMultiplicity();
    }

    lexer.match(';');

    return {
        kind: 'AttributeUsage',
        name: `subject:${name}`,
        typeName,
        multiplicity,
        children: [],
    };
}

function readTypeReference(lexer: Lexer): string {
    let typeName = lexer.readQualifiedName();
    lexer.skipWhitespace();

    if (lexer.lookAheadChar('(')) {
        let suffix = '';
        let depth = 0;
        while (!lexer.eof) {
            const ch = lexer.peek();
            suffix += lexer.advance();
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) break;
            }
        }
        typeName += suffix;
    }

    return typeName;
}

function readStatementValue(lexer: Lexer): string {
    let value = '';
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;

    while (!lexer.eof) {
        const ch = lexer.peek();
        if (ch === ';' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) break;
        if (ch === '}' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) break;

        value += lexer.advance();

        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    }

    return value.trim();
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

function readEndpointReference(lexer: Lexer, stopWords: string[]): string {
    lexer.skipWhitespace();
    let text = '';

    while (!lexer.eof) {
        if (lexer.lookAheadChar('{') || lexer.lookAheadChar(';') || lexer.lookAheadChar('}')) break;
        if (stopWords.some((word) => lexer.lookAhead(word))) break;
        text += lexer.advance();
    }

    return text
        .trim()
        .replace(/^(logical|physical)\s*::>\s*/i, '')
        .replace(/^references\s+/i, '');
}

function readEndpointList(lexer: Lexer): string[] {
    const targets: string[] = [];

    while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        const target = readEndpointReference(lexer, [',', '{', ';', '}']);
        if (target) targets.push(target);
        lexer.skipWhitespace();
        if (!lexer.match(',')) break;
    }

    lexer.match(';');
    return targets;
}

function parseViewpointDef(lexer: Lexer): SysMLNode {
    lexer.expect('viewpoint');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);

    const concerns: string[] = [];
    for (const child of children) {
        if (child.kind === 'AttributeUsage' && child.name === 'concerns') {
            const val = nodeProperties(child).defaultValue;
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

    let name = 'viewpoint';
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
        name = typeName;
    } else {
        name = lexer.readIdentifier();
        if (lexer.match(':')) {
            typeName = readTypeReference(lexer);
        }
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
        viewpoint = readTypeReference(lexer);
    }

    const children = parseBody(lexer);
    return { kind: 'ViewDef', name, shortName, viewpoint, children } as SysMLNode;
}

function parseViewUsage(lexer: Lexer): SysMLNode {
    lexer.expect('view');

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
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
                typeName: nodeProperties(child).typeName,
            };
        }
    }

    return { kind: 'VerificationDef', name, shortName, subject, children } as SysMLNode;
}

function parseVerificationUsage(lexer: Lexer): SysMLNode {
    if (lexer.match('verify')) {
        if (lexer.lookAhead('requirement')) {
            lexer.match('requirement');
        }
        const name = lexer.readIdentifier();
        let typeName: string | undefined;
        if (lexer.match(':')) {
            typeName = readTypeReference(lexer);
        }
        while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
            lexer.advance();
        }
        const children = parseBody(lexer);
        return { kind: 'VerificationUsage', name: name || 'verify', typeName, targetRef: name, children } as SysMLNode;
    }

    lexer.expect('verification');
    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
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
        typeName = readTypeReference(lexer);
    }

    const children = parseBody(lexer);
    return { kind: 'AnalysisUsage', name, typeName, children } as SysMLNode;
}

function parseObjectiveUsage(lexer: Lexer): SysMLNode {
    lexer.expect('objective');
    const children = parseBody(lexer);
    return { kind: 'VerificationUsage', name: 'objective', children } as SysMLNode;
}

function parseMetadataAnnotation(lexer: Lexer): SysMLNode {
    lexer.expect('@');
    const name = lexer.readQualifiedName();
    const body = lexer.readBracedContent();

    return {
        kind: 'MetadataDef',
        name,
        attributes: body ? [{ name: 'body', value: body }] : [],
        children: [],
    } as SysMLNode;
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

    if (lexer.lookAhead('requirement')) {
        lexer.match('requirement');
    }

    const name = lexer.readIdentifier();
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
    }

    let sourceRef: string | undefined;
    if (lexer.match('by')) {
        sourceRef = readReference(lexer);
    }

    while (!lexer.eof && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar('}')) {
        lexer.advance();
    }

    const children = parseBody(lexer);

    return {
        kind: 'RequirementUsage',
        name: name || 'satisfy',
        typeName,
        sourceRef,
        targetRef: name,
        children,
    } as SysMLNode;
}

function parseUseCaseDef(lexer: Lexer): UseCaseDef {
    lexer.expect('use');
    lexer.expect('case');
    lexer.expect('def');

    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);
    return {
        kind: 'UseCaseDef',
        name,
        shortName,
        children,
    };
}

function parseUseCaseUsage(lexer: Lexer, includeKind: 'include' | 'extend' | 'normal'): UseCaseUsage {
    if (includeKind === 'include') lexer.expect('include');
    if (includeKind === 'extend') lexer.expect('extend');
    lexer.expect('use');
    lexer.expect('case');

    const { name, shortName } = parseNameWithShortName(lexer);
    let typeName: string | undefined;
    if (lexer.match(':')) {
        typeName = readTypeReference(lexer);
    }

    const children = parseBody(lexer);
    return {
        kind: 'UseCaseUsage',
        name,
        shortName,
        typeName,
        includeKind,
        children,
    };
}

function parseAllocationDef(lexer: Lexer): AllocationDef {
    lexer.expect('allocation');
    lexer.expect('def');
    const { name, shortName } = parseNameWithShortName(lexer);
    const children = parseBody(lexer);
    return {
        kind: 'AllocationDef',
        name,
        shortName,
        children,
    };
}

function parseAllocationUsage(lexer: Lexer): AllocationUsage {
    let name = 'allocation';
    let typeName: string | undefined;

    if (lexer.match('allocation')) {
        if (!lexer.lookAhead('allocate') && !lexer.lookAheadChar('{') && !lexer.lookAheadChar(';')) {
            name = lexer.readIdentifier();
            if (lexer.match(':')) {
                typeName = readTypeReference(lexer);
            }
        }
    } else {
        lexer.expect('allocate');
    }

    let source = '';
    let target = '';

    if (lexer.match('allocate')) {
        source = readEndpointReference(lexer, ['to', '{', ';']);
        lexer.match('to');
        target = readEndpointReference(lexer, ['{', ';']);
    }

    const children = parseBody(lexer);
    return {
        kind: 'AllocationUsage',
        name,
        source,
        target,
        typeName,
        children,
    };
}

function parseDependencyUsage(lexer: Lexer): DependencyUsage {
    lexer.expect('dependency');
    let name = 'dependency';
    let source = '';
    let targets: string[] = [];

    if (!lexer.lookAhead('from') && !lexer.lookAheadChar(';') && !lexer.lookAheadChar('{')) {
        const candidate = lexer.readIdentifier();
        if (lexer.lookAhead('from')) {
            name = candidate;
        } else if (lexer.lookAhead('to')) {
            source = candidate;
        } else {
            name = candidate;
        }
    }

    if (lexer.match('from')) {
        source = readEndpointReference(lexer, ['to', '{', ';']);
    }

    if (lexer.match('to')) {
        targets = readEndpointList(lexer);
    }

    const children = parseBody(lexer);
    return {
        kind: 'DependencyUsage',
        name,
        source,
        targets,
        children,
    };
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
