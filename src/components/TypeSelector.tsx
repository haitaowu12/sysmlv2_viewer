/**
 * TypeSelector - Dropdown with auto-complete for SysML types
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/store';
import type { SysMLNode } from '../parser/types';

interface TypeSelectorProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
}

export default function TypeSelector({ value, onChange, placeholder, className }: TypeSelectorProps) {
    const model = useAppStore(s => s.model);
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(value);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const typeOptions = useMemo(() => {
        if (!model) return [];
        const options = new Set<string>();

        options.add('Boolean');
        options.add('Integer');
        options.add('Real');
        options.add('String');
        options.add('DateTime');

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

    const filteredOptions = useMemo(() => {
        if (!searchTerm) return typeOptions;
        const lower = searchTerm.toLowerCase();
        return typeOptions.filter(opt => opt.toLowerCase().includes(lower));
    }, [typeOptions, searchTerm]);

    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [filteredOptions]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && listRef.current) {
            const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement;
            if (highlightedItem) {
                highlightedItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (option: string) => {
        onChange(option);
        setSearchTerm(option);
        setIsOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setIsOpen(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(i => Math.min(i + 1, filteredOptions.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    handleSelect(filteredOptions[highlightedIndex]);
                } else if (searchTerm) {
                    onChange(searchTerm);
                    setIsOpen(false);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
            case 'Tab':
                setIsOpen(false);
                break;
        }
    };

    const handleBlur = () => {
        if (!isOpen) {
            if (searchTerm !== value) {
                onChange(searchTerm);
            }
        }
    };

    return (
        <div ref={containerRef} className={`type-selector ${className || ''}`}>
            <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                placeholder={placeholder || 'Select or type...'}
                className="prop-input"
                style={{ width: '100%' }}
                autoComplete="off"
            />
            {isOpen && filteredOptions.length > 0 && (
                <div
                    ref={listRef}
                    className="type-selector-dropdown"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: 'var(--shadow-md)',
                    }}
                >
                    {filteredOptions.map((option, index) => (
                        <div
                            key={option}
                            className={`type-selector-option ${index === highlightedIndex ? 'highlighted' : ''}`}
                            style={{
                                padding: '6px 10px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                background: index === highlightedIndex ? 'var(--bg-hover)' : 'transparent',
                                color: index === highlightedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                            }}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelect(option);
                            }}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
