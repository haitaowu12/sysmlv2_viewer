/**
 * Monaco Code Editor with SysML v2 syntax highlighting
 */

import { useRef, useEffect, useCallback } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store/store';

function registerSysMLLanguage(monaco: Monaco) {
    // Register language
    monaco.languages.register({ id: 'sysml' });

    // Token provider
    monaco.languages.setMonarchTokensProvider('sysml', {
        keywords: [
            'package', 'part', 'port', 'connection', 'interface', 'action', 'state',
            'transition', 'requirement', 'constraint', 'attribute', 'item', 'enum',
            'def', 'redefines', 'subsets', 'flow', 'bind', 'import', 'doc',
            'in', 'out', 'inout', 'from', 'to', 'first', 'then', 'accept',
            'if', 'do', 'entry', 'exit', 'private', 'public', 'protected',
            'connect', 'end', 'subject', 'require', 'assume', 'satisfy', 'verify',
            'derive', 'allocate', 'use', 'case', 'view', 'viewpoint', 'about',
            'alias', 'for', 'return', 'abstract', 'variation', 'variant',
        ],
        operators: [':>', ':', '=', ';', ',', '.', '::', '~', '*'],
        symbols: /[=><!~?:&|+\-*/^%]+/,

        tokenizer: {
            root: [
                [/\/\/.*$/, 'comment'],
                [/\/\*/, 'comment', '@comment'],
                [/'[^']*'/, 'string'],
                [/"[^"]*"/, 'string'],
                [/<'[^']*'>/, 'annotation'],
                [/\d+(\.\d+)?/, 'number'],
                [/[a-zA-Z_]\w*/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier',
                    },
                }],
                [/[{}()\[\]]/, '@brackets'],
                [/[;,.]/, 'delimiter'],
                [/:>/, 'operator'],
                [/[=><!~?:&|+\-*/^%]+/, 'operator'],
            ],
            comment: [
                [/[^/*]+/, 'comment'],
                [/\*\//, 'comment', '@pop'],
                [/[/*]/, 'comment'],
            ],
        },
    });

    // Language configuration (brackets, auto-close, etc.)
    monaco.languages.setLanguageConfiguration('sysml', {
        comments: {
            lineComment: '//',
            blockComment: ['/*', '*/'],
        },
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
        ],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: "'", close: "'", notIn: ['string'] },
            { open: '"', close: '"', notIn: ['string'] },
            { open: '/*', close: ' */', notIn: ['string'] },
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: "'", close: "'" },
            { open: '"', close: '"' },
        ],
        indentationRules: {
            increaseIndentPattern: /.*\{[^}"']*$/,
            decreaseIndentPattern: /^\s*\}/,
        },
    });

    // Define a dark theme for SysML
    monaco.editor.defineTheme('sysml-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: 'c792ea', fontStyle: 'bold' },
            { token: 'identifier', foreground: 'eeffff' },
            { token: 'string', foreground: 'c3e88d' },
            { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
            { token: 'number', foreground: 'f78c6c' },
            { token: 'operator', foreground: '89ddff' },
            { token: 'annotation', foreground: 'ffcb6b' },
            { token: 'delimiter', foreground: '89ddff' },
        ],
        colors: {
            'editor.background': '#0f0e17',
            'editor.foreground': '#e2e8f0',
            'editor.lineHighlightBackground': '#1a1830',
            'editor.selectionBackground': '#3730a3',
            'editorCursor.foreground': '#818cf8',
            'editorLineNumber.foreground': '#4c4f69',
            'editorLineNumber.activeForeground': '#818cf8',
        },
    });

    // Light theme
    monaco.editor.defineTheme('sysml-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '7c3aed', fontStyle: 'bold' },
            { token: 'identifier', foreground: '1e293b' },
            { token: 'string', foreground: '16a34a' },
            { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
            { token: 'number', foreground: 'ea580c' },
            { token: 'operator', foreground: '0284c7' },
            { token: 'annotation', foreground: 'd97706' },
        ],
        colors: {
            'editor.background': '#fefefe',
            'editor.foreground': '#1e293b',
        },
    });

    // Basic completions
    monaco.languages.registerCompletionItemProvider('sysml', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const suggestions = [
                { label: 'package', insertText: "package '${1:PackageName}' {\n\t$0\n}", kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'part def', insertText: 'part def ${1:Name} {\n\t$0\n}', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'part', insertText: 'part ${1:name} : ${2:Type};', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'port def', insertText: 'port def ${1:Name};', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'action def', insertText: 'action def ${1:Name} {\n\tin ${2:input} : ${3:Type};\n\tout ${4:output} : ${5:Type};\n}', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'state def', insertText: 'state def ${1:Name} {\n\tentry; then ${2:initialState};\n\t\n\tstate ${2:initialState};\n}', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'requirement def', insertText: 'requirement def ${1:Name} {\n\tdoc /* ${2:description} */\n}', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'connection def', insertText: 'connection def ${1:Name} {\n\tend ${2:end1} : ${3:Type};\n\tend ${4:end2} : ${5:Type};\n}', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'attribute', insertText: 'attribute ${1:name} : ${2:Type};', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
                { label: 'transition', insertText: 'transition ${1:name}\n\tfirst ${2:source}\n\taccept ${3:trigger}\n\tthen ${4:target};', kind: monaco.languages.CompletionItemKind.Keyword, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet },
            ].map(s => ({ ...s, range }));

            return { suggestions };
        },
    });
}

export default function CodeEditor() {
    const sourceCode = useAppStore(s => s.sourceCode);
    const setSourceCode = useAppStore(s => s.setSourceCode);
    const parseSource = useAppStore(s => s.parseSource);
    const parseErrors = useAppStore(s => s.parseErrors);
    const isDarkMode = useAppStore(s => s.isDarkMode);
    const selectedNode = useAppStore(s => s.selectedNode);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const parseTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const handleEditorMount = useCallback((editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        registerSysMLLanguage(monaco);
        editor.updateOptions({ theme: isDarkMode ? 'sysml-dark' : 'sysml-light' });
    }, [isDarkMode]);

    const handleChange = useCallback((value: string | undefined) => {
        if (value !== undefined) {
            setSourceCode(value);
            // Debounced parse
            if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
            parseTimerRef.current = setTimeout(() => {
                parseSource();
            }, 500);
        }
    }, [setSourceCode, parseSource]);

    // Update error markers
    useEffect(() => {
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        if (!monaco || !editor) return;

        const model = editor.getModel();
        if (!model) return;

        const markers = parseErrors.map(err => ({
            severity: monaco.MarkerSeverity.Error,
            message: err.message,
            startLineNumber: err.location?.start.line || 1,
            startColumn: err.location?.start.column || 1,
            endLineNumber: err.location?.end.line || 1,
            endColumn: err.location?.end.column || 1,
        }));

        monaco.editor.setModelMarkers(model, 'sysml', markers);
    }, [parseErrors]);

    // Update theme
    useEffect(() => {
        const editor = editorRef.current;
        if (editor) {
            editor.updateOptions({ theme: isDarkMode ? 'sysml-dark' : 'sysml-light' });
        }
    }, [isDarkMode]);

    // Scroll to selection
    useEffect(() => {
        const editor = editorRef.current;
        if (editor && selectedNode && selectedNode.location) {
            const line = selectedNode.location.start.line;
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column: 1 });
            editor.focus();
        }
    }, [selectedNode]);

    // Parse on mount
    useEffect(() => {
        parseSource();
    }, []);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const domNode = editor.getDomNode();
        if (!domNode) return;

        const onDragOver = (event: DragEvent) => {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer?.types.includes('application/sysml-template')) return;
            event.preventDefault();
            dataTransfer.dropEffect = 'copy';
        };

        const onDrop = (event: DragEvent) => {
            const dataTransfer = event.dataTransfer;
            const template = dataTransfer?.getData('application/sysml-template');
            if (!template) return;

            event.preventDefault();
            event.stopPropagation();

            const position = editor.getPosition();
            const selection = editor.getSelection();
            if (!position) return;

            const range = selection ?? {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            };

            editor.executeEdits('sysml-library-drop', [
                {
                    range,
                    text: `\n${template}\n`,
                    forceMoveMarkers: true,
                },
            ]);
            editor.focus();
        };

        domNode.addEventListener('dragover', onDragOver);
        domNode.addEventListener('drop', onDrop);
        return () => {
            domNode.removeEventListener('dragover', onDragOver);
            domNode.removeEventListener('drop', onDrop);
        };
    }, []);

    return (
        <div className="code-editor-container">
            <Editor
                height="100%"
                defaultLanguage="sysml"
                value={sourceCode}
                onChange={handleChange}
                onMount={handleEditorMount}
                theme={isDarkMode ? 'sysml-dark' : 'sysml-light'}
                options={{
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontLigatures: true,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    padding: { top: 12 },
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: 'on',
                    cursorBlinking: 'smooth',
                    bracketPairColorization: { enabled: true },
                }}
            />
        </div>
    );
}
