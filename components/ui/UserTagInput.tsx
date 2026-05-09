'use client';

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { X, User, Mail, Loader2, Check } from 'lucide-react';
import Avatar from './Avatar';
import { cn } from '@/lib/utils';

interface Tag {
  id: string;
  value: string;
  type: 'username' | 'email';
  status: 'verifying' | 'valid' | 'invalid';
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface UserTagInputProps {
  tags: Tag[];
  setTags: (tags: Tag[] | ((prev: Tag[]) => Tag[])) => void;
  placeholder?: string;
}

export default function UserTagInput({ tags, setTags, placeholder }: UserTagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = async (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return;
    
    // Check for duplicates
    if (tags.some(t => t.value === trimmed)) return;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const newTag: Tag = {
      id: Math.random().toString(36).substr(2, 9),
      value: trimmed,
      type: isEmail ? 'email' : 'username',
      status: isEmail ? 'valid' : 'verifying',
    };

    setTags((prev: Tag[]) => [...prev, newTag]);
    setInputValue('');

    if (newTag.type === 'username') {
      try {
        const res = await fetch(`/api/users/lookup?username=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        
        setTags((prev: Tag[]) => prev.map((t: Tag) => 
          t.value === trimmed 
            ? { 
                ...t, 
                status: res.ok ? 'valid' : 'invalid',
                profile: data.profile 
              } 
            : t
        ));
      } catch (e) {
        setTags((prev: Tag[]) => prev.map((t: Tag) => t.value === trimmed ? { ...t, status: 'invalid' } : t));
      }
    }
  };

  const removeTag = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || (e.key === ' ' && inputValue.trim())) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1].id);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    const values = paste.split(/[,\s]+/).filter(Boolean);
    
    // Compute new tags atomically to avoid race conditions
    const newTags = values.map(v => {
      const trimmed = v.trim().toLowerCase();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      const existingTag = tags.find(t => t.value === trimmed);
      
      if (existingTag) return existingTag;
      
      const id = Math.random().toString(36).substr(2, 9);
      const newTag: Tag = {
        id,
        value: trimmed,
        type: isEmail ? 'email' : 'username',
        status: isEmail ? 'valid' : 'verifying',
      };
      
      return newTag;
    });
    
    setTags((prev: Tag[]) => [...prev, ...newTags]);
  };

  return (
    <div 
      className={cn(
        "flex flex-wrap gap-2 p-2 min-h-[52px] rounded-[12px] border border-[#E0EBE1] bg-white transition-all duration-150",
        "focus-within:border-[#2D6A4F] focus-within:ring-3 focus-within:ring-[rgba(45,106,79,0.12)]"
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <div
          key={tag.id}
          className={cn(
            "flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full text-xs font-medium transition-all animate-in fade-in zoom-in duration-200",
            tag.status === 'verifying' ? "bg-gray-100 text-gray-500" :
            tag.status === 'valid' ? "bg-[#EEF5EE] text-[#1B4332] border border-[#D8EDDA]" :
            "bg-[#FEF1F1] text-[#C53030] border border-[#FEE2E2]"
          )}
        >
          {tag.type === 'username' ? (
            tag.profile?.avatar_url ? (
              <Avatar name={tag.value} src={tag.profile.avatar_url} size="xs" ring={false} />
            ) : (
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center border border-current opacity-20">
                <User size={12} />
              </div>
            )
          ) : (
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center border border-current opacity-20">
              <Mail size={12} />
            </div>
          )}
          
          <span className="max-w-[120px] truncate">
            {tag.profile?.full_name || tag.value}
          </span>

          {tag.status === 'verifying' && <Loader2 size={10} className="animate-spin" />}
          {tag.status === 'valid' && <Check size={10} className="text-[#2D6A4F]" />}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(tag.id); }}
            className="hover:bg-black/5 rounded-full p-0.5 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => addTag(inputValue)}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm py-1 px-1 placeholder:text-[#8FA38F]"
      />
    </div>
  );
}
