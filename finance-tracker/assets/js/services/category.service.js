/**
 * @fileoverview Category service — manages built-in + user-defined custom categories.
 *
 * Custom categories live in AppState.customCategories and are persisted
 * to the Supabase `custom_categories` table via dispatch / saveRecord.
 */

import { getState, dispatch } from '../state.js';
import { CATEGORIES } from '../data/seed.js';

export const CategoryService = {
  /**
   * Return all categories (built-in + custom) for a given type.
   * @param {'CR'|'DR'|'ALL'} type
   * @returns {Array<{id:string,label:string,emoji:string,color:string,type:string,isCustom?:boolean}>}
   */
  getAll(type = 'ALL') {
    const custom = (getState().customCategories || []);
    const all = [...CATEGORIES, ...custom];
    if (type === 'ALL') return all;
    return all.filter(c => c.type === type);
  },

  /**
   * Find a category by id (built-in first, then custom).
   * @param {string} id
   * @returns {Object}
   */
  getById(id) {
    const custom = (getState().customCategories || []);
    return (
      CATEGORIES.find(c => c.id === id) ||
      custom.find(c => c.id === id) ||
      { id, label: id, emoji: '📦', color: '#888', type: 'DR' }
    );
  },

  /**
   * Add a new custom category.
   * @param {{label:string, emoji:string, color:string, type:'CR'|'DR'}} data
   * @returns {{id:string, label:string, emoji:string, color:string, type:string, isCustom:true}}
   */
  add({ label, emoji, color, type }) {
    if (!label || label.trim().length < 2) throw new Error('Category name must be at least 2 characters.');
    if (!['CR', 'DR'].includes(type)) throw new Error('Type must be CR or DR.');

    const trimmed = label.trim();

    // Prevent duplicate names (case-insensitive)
    const existing = CategoryService.getAll('ALL');
    if (existing.some(c => c.label.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`A category named "${trimmed}" already exists.`);
    }

    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const category = {
      id,
      label: trimmed,
      emoji: emoji || '📦',
      color: color || '#60A5FA',
      type,
      isCustom: true,
      createdAt: new Date().toISOString()
    };

    dispatch('ADD_CUSTOM_CATEGORY', category);
    return category;
  },

  /**
   * Delete a custom category by id.
   * @param {string} id
   */
  delete(id) {
    dispatch('DELETE_CUSTOM_CATEGORY', id);
  }
};
