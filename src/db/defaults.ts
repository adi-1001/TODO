import type { RepeatRule, TaskFilters, UserSettings } from '../types';

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'app',
  updatedAt: 1,
  displayName: '',
  avatarDataUrl: null,
  targetExamTitle: '',
  targetExamDate: null,
  dailyGoalMinutes: 300,
  hydrationGoal: 8,
  defaultPomodoroMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  clockStyle: 'digital',
  eyeRestEnabled: true,
  bellEnabled: true,
  bellIntervalMinutes: 10,
  overviewMetrics: ['questions', 'pending', 'completedToday', 'focusGoal'],
  reviewMetrics: ['questions', 'completedToday', 'focusGoal', 'streak'],
  lastBackupAt: null,
  streakThresholdPercent: 80,
};

export const NO_MISTAKES = { conceptual: 0, calculation: 0, timePressure: 0, guessed: 0 };

export const NO_REPEAT: RepeatRule = { kind: 'never', intervalDays: 2 };

export const NO_FILTERS: TaskFilters = { examWeightage: false, activeRecall: false, requiredForClass: false };

export const SUBJECT_COLORS = ['#F5A35C', '#6FA8DC', '#E79AA6', '#86BFA0', '#B39DDB', '#E6C35C', '#7CC4C6', '#C9A27E'];

export const UNIT_SUGGESTIONS = ['Questions', 'PYQs', 'Pages', 'Lectures', 'Problems', 'Chapters'];
