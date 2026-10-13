import type { LucideIcon } from 'lucide-react';
import {
  // Study & Knowledge
  BookOpen,
  Brain,
  GraduationCap,
  Library,
  NotebookPen,
  Pencil,
  Languages,
  Calculator,
  Lightbulb,

  // Work & Technology
  Laptop,
  Code,
  Terminal,
  BriefcaseBusiness,
  Monitor,
  FileText,
  Target,
  FolderKanban,

  // Health & Fitness
  Dumbbell,
  Activity,
  Footprints,
  Bike,
  HeartPulse,
  PersonStanding,
  Moon,
  Sun,
  Coffee,
  Droplets,

  // Daily Life
  House,
  Utensils,
  Bed,
  Bath,
  Pill,
  ShoppingBasket,
  Wallet,
  CalendarDays,

  // Hobbies & Personal
  Gamepad2,
  Music,
  Headphones,
  Camera,
  Palette,
  Trophy,
  Puzzle,
  Timer,
  Clock,
  Sparkles,

  // General
  CheckCircle2,
  ListTodo,
  Star,
  Zap,
  Flag,
  Circle,
  Bookmark,

  // Heuristic fallbacks & aliases
  Briefcase,
  Heart,
} from 'lucide-react';

export interface IconCategory {
  name: string;
  icons: string[];
}

export const ICON_CATEGORIES: IconCategory[] = [
  {
    name: 'Study & Knowledge',
    icons: ['BookOpen', 'Brain', 'GraduationCap', 'Library', 'NotebookPen', 'Pencil', 'Languages', 'Calculator', 'Lightbulb'],
  },
  {
    name: 'Work & Technology',
    icons: ['Laptop', 'Code', 'Terminal', 'BriefcaseBusiness', 'Monitor', 'FileText', 'Target', 'FolderKanban'],
  },
  {
    name: 'Health & Fitness',
    icons: ['Dumbbell', 'Activity', 'Footprints', 'Bike', 'HeartPulse', 'PersonStanding', 'Moon', 'Sun', 'Coffee', 'Droplets'],
  },
  {
    name: 'Daily Life',
    icons: ['House', 'Utensils', 'Bed', 'Bath', 'Pill', 'ShoppingBasket', 'Wallet', 'CalendarDays'],
  },
  {
    name: 'Hobbies & Personal',
    icons: ['Gamepad2', 'Music', 'Headphones', 'Camera', 'Palette', 'Trophy', 'Puzzle', 'Timer', 'Clock', 'Sparkles'],
  },
  {
    name: 'General',
    icons: ['CheckCircle2', 'ListTodo', 'Star', 'Zap', 'Flag', 'Circle', 'Bookmark'],
  },
];

export const TASK_ICON_MAP: Record<string, LucideIcon> = {
  // Study & Knowledge
  BookOpen,
  Brain,
  GraduationCap,
  Library,
  NotebookPen,
  Pencil,
  Languages,
  Calculator,
  Lightbulb,

  // Work & Technology
  Laptop,
  Code,
  Terminal,
  BriefcaseBusiness,
  Monitor,
  FileText,
  Target,
  FolderKanban,

  // Health & Fitness
  Dumbbell,
  Activity,
  Footprints,
  Bike,
  HeartPulse,
  PersonStanding,
  Moon,
  Sun,
  Coffee,
  Droplets,

  // Daily Life
  House,
  Utensils,
  Bed,
  Bath,
  Pill,
  ShoppingBasket,
  Wallet,
  CalendarDays,

  // Hobbies & Personal
  Gamepad2,
  Music,
  Headphones,
  Camera,
  Palette,
  Trophy,
  Puzzle,
  Timer,
  Clock,
  Sparkles,

  // General
  CheckCircle2,
  ListTodo,
  Star,
  Zap,
  Flag,
  Circle,
  Bookmark,

  // Heuristic fallbacks & common aliases
  Briefcase,
  Heart,
  Home: House,
  CheckCircle: CheckCircle2,
};

export const DEFAULT_TASK_FALLBACK_ICON: LucideIcon = Circle;

/**
 * Returns the Lucide icon component corresponding to the given icon name,
 * or null if iconName is empty/unrecognized.
 */
export function getTaskIcon(iconName: string | null | undefined): LucideIcon | null {
  if (!iconName) return null;
  return TASK_ICON_MAP[iconName] ?? null;
}
