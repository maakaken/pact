import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatTimeAgo(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string): string {
  return format(new Date(date), 'dd MMM yyyy');
}

export function getTimeRemaining(endDate: string): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} {
  const total = differenceInSeconds(new Date(endDate), new Date());
  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds, total };
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getCategoryColor(category: string | null): string {
  const map: Record<string, string> = {
    Coding: '#2D6A4F',
    Fitness: '#E07A5F',
    Learning: '#F4A261',
    Finance: '#74C69D',
    Wellness: '#52B788',
    Creative: '#B5A4D4',
    Other: '#8FA38F',
  };
  return map[category ?? 'Other'] ?? '#8FA38F';
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}
