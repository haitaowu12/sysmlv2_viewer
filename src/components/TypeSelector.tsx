/**
 * TypeSelector - specific input with auto-complete for SysML types
 */

import { useMemo } from 'react';
import { useAppStore } from '../store/store';
import type { SysMLNode } from '../parser/types';

interface InternalTypeSelectorProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
}

export default function TypeSelector({ value, onChange, placeholder, className }: InternalTypeSelectorProps) {
    const model = useAppStore(s => s.model);

    // Collect all definitions from the model
    const typeOptions = useMemo(() => {
        if (!model) return [];
        const options = new Set<string>();

        // Basic primitive types
        options.add('Boolean');
        options.add('Integer');
        options.add('Real');
        options.add('String');

        // Traverse model
        const traverse = (nodes: SysMLNode[]) => {
            for (const node of nodes) {
                if (node.kind.endsWith('Def')) {
                    options.add(node.name);
                }
                traverse(node.children);
            }
        };

        traverse(model.children);
        return Array.from(options).sort();
    }, [model]);

    return (
        <div className={className}>
            <input
                list="sysml-types"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || "Select or type..."}
                className="prop-input" // Reuse existing class
                style={{ width: '100%' }}
            />
            <datalist id="sysml-types">
                {typeOptions.map(opt => (
                    <option key={opt} value={opt} />
                ))}
            </datalist>
        </div>
    );
}
