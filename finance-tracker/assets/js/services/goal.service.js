/**
 * @fileoverview Saving goals service
 */

import { getState, dispatch } from '../state.js';
import { sanitizeFormData, validate } from '../security/index.js';

const uuid = () => crypto.randomUUID();

export const GoalService = {
  add(data) {
    const clean = sanitizeFormData({
      ...data,
      targetAmount: parseFloat(data.targetAmount) || 0,
      savedAmount: parseFloat(data.savedAmount) || 0
    });

    if (!clean.name) throw new Error('Goal name is required');
    if (clean.targetAmount <= 0) throw new Error('Target amount must be greater than 0');
    if (clean.savedAmount < 0) throw new Error('Saved amount cannot be negative');

    const newGoal = {
      id: uuid(),
      name: clean.name,
      targetAmount: clean.targetAmount,
      savedAmount: clean.savedAmount,
      targetDate: clean.targetDate || null,
      color: clean.color || '#3b82f6',
      icon: clean.icon || '🎯',
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_GOAL', newGoal);
    return newGoal;
  },

  edit(id, updates) {
    const state = getState();
    const goal = state.goals.find(g => g.id === id);
    if (!goal) return null;

    const clean = sanitizeFormData({ ...updates });
    if (clean.targetAmount !== undefined) clean.targetAmount = parseFloat(clean.targetAmount) || 0;
    if (clean.savedAmount !== undefined) clean.savedAmount = parseFloat(clean.savedAmount) || 0;

    const updatedGoal = { ...goal, ...clean };

    if (!updatedGoal.name) throw new Error('Goal name is required');
    if (updatedGoal.targetAmount <= 0) throw new Error('Target amount must be greater than 0');
    if (updatedGoal.savedAmount < 0) throw new Error('Saved amount cannot be negative');

    dispatch('EDIT_GOAL', updatedGoal);
    return updatedGoal;
  },

  delete(id) {
    dispatch('DELETE_GOAL', id);
    return true;
  },

  getAll() {
    const state = getState();
    return [...state.goals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getProgress(goal) {
    const utilization = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
    const remaining = goal.targetAmount - goal.savedAmount;
    const isCompleted = goal.savedAmount >= goal.targetAmount;

    return {
      utilization: Math.min(utilization, 100),
      remaining,
      isCompleted
    };
  }
};
