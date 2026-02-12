/**
 * SysML v2 Model Serializer
 * Converts the AST back to SysML v2 textual notation
 */

import type { SysMLNode, SysMLModel, DocNode, TransitionUsage, FlowUsage, BindingUsage, ImportNode, ConstraintUsage, AttributeUsage } from './types';

export function serializeModel(model: SysMLModel): string {
    return model.children.map(node => serializeNode(node, 0)).join('\n\n');
}

function indent(level: number): string {
    return '\t'.repeat(level);
}

function serializeNode(node: SysMLNode, level: number): string {
    const i = indent(level);
    const vis = node.visibility ? `${node.visibility} ` : '';

    switch (node.kind) {
        case 'Package':
            return serializePackage(node, level, vis);
        case 'PartDef':
            return serializeDefinition(node, 'part def', level, vis);
        case 'PartUsage':
            return serializeUsage(node, 'part', level, vis);
        case 'PortDef':
            return serializeDefinition(node, 'port def', level, vis);
        case 'PortUsage':
            return serializeUsage(node, 'port', level, vis);
        case 'ConnectionDef':
            return serializeDefinition(node, 'connection def', level, vis);
        case 'ConnectionUsage':
            return serializeConnectionUsage(node, level, vis);
        case 'InterfaceDef':
            return serializeDefinition(node, 'interface def', level, vis);
        case 'InterfaceUsage':
            return serializeUsage(node, 'interface', level, vis);
        case 'ActionDef':
            return serializeDefinition(node, 'action def', level, vis);
        case 'ActionUsage':
            return serializeUsage(node, 'action', level, vis);
        case 'StateDef':
            return serializeDefinition(node, 'state def', level, vis);
        case 'StateUsage':
            return serializeStateUsage(node, level);
        case 'TransitionUsage':
            return serializeTransition(node as TransitionUsage, level);
        case 'RequirementDef':
            return serializeDefinition(node, 'requirement def', level, vis);
        case 'RequirementUsage':
            return serializeUsage(node, 'requirement', level, vis);
        case 'ConstraintDef':
            return serializeDefinition(node, 'constraint def', level, vis);
        case 'ConstraintUsage':
            return serializeConstraintUsage(node as ConstraintUsage, level);
        case 'AttributeDef':
            return serializeDefinition(node, 'attribute def', level, vis);
        case 'AttributeUsage':
            return serializeAttributeUsage(node as AttributeUsage, level);
        case 'ItemDef':
            return serializeDefinition(node, 'item def', level, vis);
        case 'ItemUsage':
            return serializeUsage(node, 'item', level, vis);
        case 'EnumDef':
            return serializeDefinition(node, 'enum def', level, vis);
        case 'FlowUsage':
            return serializeFlow(node as FlowUsage, level);
        case 'BindingUsage':
            return serializeBinding(node as BindingUsage, level);
        case 'Import':
            return `${i}${vis}import ${(node as ImportNode).importPath};`;
        case 'Doc':
            return `${i}doc /* ${(node as DocNode).text} */`;
        case 'Comment':
            return `${i}/* ${(node as any).text} */`;
        default:
            return `${i}// ${node.kind}: ${node.name}`;
    }
}

function serializePackage(node: SysMLNode, level: number, vis: string): string {
    const i = indent(level);
    const name = node.name.includes(' ') ? `'${node.name}'` : node.name;
    if (node.children.length === 0) {
        return `${i}${vis}package ${name};`;
    }
    const body = node.children.map(c => serializeNode(c, level + 1)).join('\n\n');
    return `${i}${vis}package ${name} {\n${body}\n${i}}`;
}

function serializeDefinition(node: SysMLNode, keyword: string, level: number, vis: string): string {
    const i = indent(level);
    const short = node.shortName ? `<'${node.shortName}'> ` : '';
    const name = node.name.includes(' ') ? `'${node.name}'` : node.name;

    let supers = '';
    if ('superTypes' in node && (node as any).superTypes?.length) {
        supers = ` :> ${(node as any).superTypes.join(', ')}`;
    }

    if (node.children.length === 0) {
        return `${i}${vis}${keyword} ${short}${name}${supers};`;
    }

    const body = node.children.map(c => serializeNode(c, level + 1)).join('\n');
    return `${i}${vis}${keyword} ${short}${name}${supers} {\n${body}\n${i}}`;
}

function serializeUsage(node: SysMLNode, keyword: string, level: number, vis: string): string {
    const i = indent(level);
    const typed = 'typeName' in node && (node as any).typeName ? ` : ${(node as any).typeName}` : '';
    const redef = 'isRedefine' in node && (node as any).isRedefine ? 'redefines ' : '';
    const mult = 'multiplicity' in node && (node as any).multiplicity ? `[${(node as any).multiplicity}]` : '';

    if (node.children.length === 0) {
        return `${i}${vis}${keyword} ${redef}${node.name}${typed}${mult};`;
    }

    const body = node.children.map(c => serializeNode(c, level + 1)).join('\n');
    return `${i}${vis}${keyword} ${redef}${node.name}${typed}${mult} {\n${body}\n${i}}`;
}

function serializeConnectionUsage(node: SysMLNode, level: number, vis: string): string {
    const i = indent(level);
    const conn = node as any;
    const typed = conn.typeName ? ` : ${conn.typeName}` : '';
    return `${i}${vis}connect${typed} ${conn.source} to ${conn.target};`;
}

function serializeStateUsage(node: SysMLNode, level: number): string {
    const i = indent(level);
    const state = node as any;
    const parallel = state.isParallel ? 'parallel ' : '';

    if (node.children.length === 0) {
        return `${i}state ${parallel}${node.name};`;
    }

    const body = node.children.map((c: SysMLNode) => serializeNode(c, level + 1)).join('\n');
    return `${i}state ${parallel}${node.name} {\n${body}\n${i}}`;
}

function serializeTransition(node: TransitionUsage, level: number): string {
    const i = indent(level);

    if (node.name === 'entry') {
        return `${i}entry; then ${node.target};`;
    }

    let result = `${i}transition ${node.name}`;
    if (node.source) result += `\n${i}\tfirst ${node.source}`;
    if (node.trigger) result += `\n${i}\taccept ${node.trigger}`;
    if (node.guard) result += `\n${i}\tif { ${node.guard} }`;
    if (node.effectAction) result += `\n${i}\tdo ${node.effectAction}`;
    result += `\n${i}\tthen ${node.target};`;

    return result;
}

function serializeConstraintUsage(node: ConstraintUsage, level: number): string {
    const i = indent(level);
    const prefix = node.isRequire ? 'require ' : node.isAssume ? 'assume ' : '';
    return `${i}${prefix}constraint { ${node.expression} }`;
}

function serializeAttributeUsage(node: AttributeUsage, level: number): string {
    const i = indent(level);
    const redef = node.isRedefine ? 'redefines ' : '';
    const typed = node.typeName ? `: ${node.typeName}` : '';
    const value = node.defaultValue ? ` = ${node.defaultValue}` : '';
    return `${i}attribute ${redef}${node.name}${typed}${value};`;
}

function serializeFlow(node: FlowUsage, level: number): string {
    const i = indent(level);
    return `${i}flow from ${node.source} to ${node.target};`;
}

function serializeBinding(node: BindingUsage, level: number): string {
    const i = indent(level);
    return `${i}bind ${node.source} = ${node.target};`;
}
