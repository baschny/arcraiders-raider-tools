import { useState, useEffect, useRef } from 'react';
import type { Item } from '../types/item';
import { searchItems } from '../utils/itemData';

interface ItemSearchProps {
  onSelect: (item: Item) => void;
  placeholder?: string;
  filter?: (item: Item) => boolean;
}

export function ItemSearch({ onSelect, placeholder = 'Search items...', filter }: ItemSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length > 0) {
      let items = searchItems(query);
      if (filter) {
        items = items.filter(filter);
      }
      setResults(items);
      setShowResults(true);
      setSelectedIndex(0);
    } else {
      setResults([]);
      setShowResults(false);
    }
  }, [query, filter]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: Item) => {
    onSelect(item);
    setQuery('');
    setShowResults(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowResults(false);
        break;
    }
  };

  return (
    <div className="item-search">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => query.length > 0 && setShowResults(true)}
        placeholder={placeholder}
        className="item-search-input"
      />
      {showResults && results.length > 0 && (
        <div ref={resultsRef} className="item-search-results">
          {results.map((item, index) => (
            <div
              key={item.id}
              className={`item-search-result ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item.imageFilename && (
                <img src={item.imageFilename} alt={item.name} className="item-icon" />
              )}
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                {item.stackSize && (
                  <div className="item-meta">Stack: {item.stackSize}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
