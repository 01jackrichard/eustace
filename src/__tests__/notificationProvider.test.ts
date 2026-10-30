import { describe, it, expect } from 'vitest';
import React from 'react';
import { useNotifications, NotificationProvider } from '../hooks/useNotifications';

describe('NotificationProvider & useNotifications Context', () => {
  it('exports NotificationProvider and useNotifications as callable functions', () => {
    expect(typeof NotificationProvider).toBe('function');
    expect(typeof useNotifications).toBe('function');
  });

  it('renders NotificationProvider without crashing when given children', () => {
    // In React 19, a functional component is a function returning JSX element or null
    const element = React.createElement(NotificationProvider, null, React.createElement('div', { id: 'child' }, 'test'));
    expect(element).toBeDefined();
    expect(element.type).toBe(NotificationProvider);
  });
});
