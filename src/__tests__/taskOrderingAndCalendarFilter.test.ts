import { describe, it, expect } from 'vitest';
import {
  sortTasksChronologically,
  getTaskScheduledMinutes,
  getTasksForDate,
  type AppData,
  type Task
} from '../lib/dataManager';
import { parseTimeString } from '../lib/timeUtils';

describe('Fix 1 — Chronological Task Sorting', () => {
  it('correctly parses 12-hour and 24-hour formats including midnight and noon', () => {
    // 24-hour format
    expect(parseTimeString('05:00')).toEqual({ h: 5, m: 0 });
    expect(parseTimeString('05:30')).toEqual({ h: 5, m: 30 });
    expect(parseTimeString('22:00')).toEqual({ h: 22, m: 0 });
    expect(parseTimeString('00:00')).toEqual({ h: 0, m: 0 });

    // 12-hour format
    expect(parseTimeString('5:00 AM')).toEqual({ h: 5, m: 0 });
    expect(parseTimeString('5:30 AM')).toEqual({ h: 5, m: 30 });
    expect(parseTimeString('7:00 AM')).toEqual({ h: 7, m: 0 });
    expect(parseTimeString('10:00 PM')).toEqual({ h: 22, m: 0 });

    // Midnight & Noon
    expect(parseTimeString('12:00 AM')).toEqual({ h: 0, m: 0 });
    expect(parseTimeString('12:30 AM')).toEqual({ h: 0, m: 30 });
    expect(parseTimeString('12:00 PM')).toEqual({ h: 12, m: 0 });
    expect(parseTimeString('12:45 PM')).toEqual({ h: 12, m: 45 });

    // getTaskScheduledMinutes minutes calculations
    expect(getTaskScheduledMinutes({ id: '1', name: 'Test', recurring: 'none', createdAt: '2026-10-11', description: JSON.stringify({ startTime: '05:30' }) })).toBe(330);
    expect(getTaskScheduledMinutes({ id: '2', name: 'Untimed', recurring: 'none', createdAt: '2026-10-11' })).toBeNull();
  });

  it('accurately matches the prompt example: Sleep (10 PM), Wake Up (5 AM), DSA (5:30 AM), Gym (7 AM)', () => {
    const tasks: Task[] = [
      {
        id: 't-sleep',
        name: 'Sleep — 10:00 PM',
        recurring: 'none',
        createdAt: '2026-10-11',
        description: JSON.stringify({ startTime: '22:00' })
      },
      {
        id: 't-wake',
        name: 'Wake Up — 5:00 AM',
        recurring: 'none',
        createdAt: '2026-10-11',
        description: JSON.stringify({ startTime: '05:00' })
      },
      {
        id: 't-dsa',
        name: 'DSA — 5:30 AM',
        recurring: 'none',
        createdAt: '2026-10-11',
        description: JSON.stringify({ startTime: '05:30' })
      },
      {
        id: 't-gym',
        name: 'Gym — 7:00 AM',
        recurring: 'none',
        createdAt: '2026-10-11',
        description: JSON.stringify({ startTime: '07:00' })
      }
    ];

    const sorted = sortTasksChronologically(tasks);

    expect(sorted.map(t => t.name)).toEqual([
      'Wake Up — 5:00 AM',
      'DSA — 5:30 AM',
      'Gym — 7:00 AM',
      'Sleep — 10:00 PM'
    ]);
  });

  it('extracts scheduled time from title pattern when metadata startTime is absent', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Sleep — 10:00 PM', recurring: 'none', createdAt: '2026-10-11' },
      { id: '2', name: 'Wake Up — 5:00 AM', recurring: 'none', createdAt: '2026-10-11' },
      { id: '3', name: 'DSA — 5:30 AM', recurring: 'none', createdAt: '2026-10-11' },
      { id: '4', name: 'Gym — 7:00 AM', recurring: 'none', createdAt: '2026-10-11' }
    ];

    const sorted = sortTasksChronologically(tasks);

    expect(sorted.map(t => t.id)).toEqual(['2', '3', '4', '1']);
  });

  it('places untimed/anytime tasks at the bottom while preserving their relative order', () => {
    const tasks: Task[] = [
      { id: 'u1', name: 'Untimed Task Alpha', recurring: 'none', createdAt: '2026-10-11' },
      { id: 't1', name: 'Evening Call', recurring: 'none', createdAt: '2026-10-11', description: JSON.stringify({ startTime: '18:00' }) },
      { id: 'u2', name: 'Untimed Task Beta', recurring: 'none', createdAt: '2026-10-11' },
      { id: 't2', name: 'Morning Review', recurring: 'none', createdAt: '2026-10-11', description: JSON.stringify({ startTime: '08:00' }) },
      { id: 'u3', name: 'Untimed Task Gamma', recurring: 'none', createdAt: '2026-10-11' }
    ];

    const sorted = sortTasksChronologically(tasks);

    expect(sorted.map(t => t.id)).toEqual(['t2', 't1', 'u1', 'u2', 'u3']);
  });

  it('preserves stable relative order when two tasks share the exact same scheduled time', () => {
    const tasks: Task[] = [
      { id: 't1', name: 'First at 9AM', recurring: 'none', createdAt: '2026-10-11', description: JSON.stringify({ startTime: '09:00' }) },
      { id: 't2', name: 'Second at 9AM', recurring: 'none', createdAt: '2026-10-11', description: JSON.stringify({ startTime: '09:00' }) },
      { id: 't3', name: 'Third at 9AM', recurring: 'none', createdAt: '2026-10-11', description: JSON.stringify({ startTime: '09:00' }) }
    ];

    const sorted = sortTasksChronologically(tasks);

    expect(sorted.map(t => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('interleaves specific and recurring tasks chronologically in getTasksForDate', () => {
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [
        {
          id: 'rec-daily-lunch',
          name: 'Lunch Break',
          recurring: 'daily',
          createdAt: '2026-01-01',
          description: JSON.stringify({ startTime: '12:30' })
        }
      ],
      days: {
        '2026-10-11': {
          tasks: [
            {
              id: 'sp-dinner',
              name: 'Dinner with Team',
              recurring: 'none',
              createdAt: '2026-10-11',
              description: JSON.stringify({ startTime: '19:00' })
            },
            {
              id: 'sp-standup',
              name: 'Daily Standup',
              recurring: 'none',
              createdAt: '2026-10-11',
              description: JSON.stringify({ startTime: '09:30' })
            }
          ],
          completedTaskIds: []
        }
      }
    };

    const tasks = getTasksForDate(appData, '2026-10-11');

    expect(tasks.map(t => t.id)).toEqual([
      'sp-standup',       // 09:30
      'rec-daily-lunch',  // 12:30
      'sp-dinner'         // 19:00
    ]);
  });
});

describe('Fix 2 — Future Planning & Completion Guardrails', () => {
  it('retrieves planned future-dated tasks without completing them', () => {
    const futureDate = '2026-10-25';
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [],
      days: {
        [futureDate]: {
          tasks: [
            {
              id: 'fut-1',
              name: 'Future Strategic Review',
              recurring: 'none',
              createdAt: futureDate,
              description: JSON.stringify({ startTime: '10:00' })
            }
          ],
          completedTaskIds: []
        }
      }
    };

    const futureTasks = getTasksForDate(appData, futureDate);
    expect(futureTasks.length).toBe(1);
    expect(futureTasks[0].name).toBe('Future Strategic Review');
    expect(appData.days[futureDate].completedTaskIds).toHaveLength(0);
  });
});

describe('Fix 3 — Calendar MY TASKS Completion Filter', () => {
  function getQualifyingFilterTasks(data: AppData): Task[] {
    const tasksMap = new Map<string, Task>();
    data.recurringTasks.forEach(t => tasksMap.set(t.id, t));
    Object.values(data.days).forEach(day => {
      day.tasks.forEach(t => tasksMap.set(t.id, t));
    });

    const completedTaskIds = new Set<string>();
    Object.values(data.days).forEach(day => {
      day.completedTaskIds?.forEach(id => completedTaskIds.add(id));
    });

    const qualifyingTasks: Task[] = [];
    completedTaskIds.forEach(id => {
      const task = tasksMap.get(id);
      if (task) qualifyingTasks.push(task);
    });

    return qualifyingTasks.sort((a, b) => a.name.localeCompare(b.name));
  }

  it('does NOT include brand-new uncompleted tasks in the filter', () => {
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [
        { id: 'rec-uncompleted', name: 'Uncompleted Habit', recurring: 'daily', createdAt: '2026-10-01' }
      ],
      days: {
        '2026-10-11': {
          tasks: [
            { id: 'task-new', name: 'Brand New Task', recurring: 'none', createdAt: '2026-10-11' }
          ],
          completedTaskIds: []
        }
      }
    };

    const filterTasks = getQualifyingFilterTasks(appData);
    expect(filterTasks).toEqual([]);
  });

  it('includes task in the filter once it is completed', () => {
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [],
      days: {
        '2026-10-11': {
          tasks: [
            { id: 'task-comp', name: 'Completed Task', recurring: 'none', createdAt: '2026-10-11' }
          ],
          completedTaskIds: ['task-comp']
        }
      }
    };

    const filterTasks = getQualifyingFilterTasks(appData);
    expect(filterTasks.map(t => t.id)).toEqual(['task-comp']);
  });

  it('removes task from filter when it is uncompleted and has no other completions', () => {
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [],
      days: {
        '2026-10-11': {
          tasks: [
            { id: 'task-1', name: 'Task 1', recurring: 'none', createdAt: '2026-10-11' }
          ],
          completedTaskIds: [] // uncompleted
        }
      }
    };

    const filterTasks = getQualifyingFilterTasks(appData);
    expect(filterTasks).toHaveLength(0);
  });

  it('distinguishes two tasks with identical names but different IDs', () => {
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [],
      days: {
        '2026-10-10': {
          tasks: [
            { id: 'uuid-1', name: 'Review', recurring: 'none', createdAt: '2026-10-10' }
          ],
          completedTaskIds: ['uuid-1']
        },
        '2026-10-11': {
          tasks: [
            { id: 'uuid-2', name: 'Review', recurring: 'none', createdAt: '2026-10-11' }
          ],
          completedTaskIds: ['uuid-2']
        }
      }
    };

    const filterTasks = getQualifyingFilterTasks(appData);
    expect(filterTasks).toHaveLength(2);
    expect(filterTasks.map(t => t.id)).toEqual(['uuid-1', 'uuid-2']);
  });

  it('does NOT create duplicate filter entries for a recurring task completed on multiple days', () => {
    const appData: AppData = {
      version: 2,
      settings: { theme: 'dark', weekStartsOn: 1 },
      recurringTasks: [
        { id: 'rec-1', name: 'Daily Meditation', recurring: 'daily', createdAt: '2026-10-01' }
      ],
      days: {
        '2026-10-09': { tasks: [], completedTaskIds: ['rec-1'] },
        '2026-10-10': { tasks: [], completedTaskIds: ['rec-1'] },
        '2026-10-11': { tasks: [], completedTaskIds: ['rec-1'] }
      }
    };

    const filterTasks = getQualifyingFilterTasks(appData);
    expect(filterTasks).toHaveLength(1);
    expect(filterTasks[0].id).toBe('rec-1');
  });
});
