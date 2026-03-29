import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ShoppingCart, Check, Plus, Trash2 } from 'lucide-react';

const GroceryList = ({ household }) => {
  const [groceryItems, setGroceryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (household) {
      fetchGroceryList();

      // Set up real-time subscription for grocery list changes
      const channel = supabase
        .channel('grocery_lists_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'grocery_lists',
            filter: `household_id=eq.${household.id}`
          },
          (payload) => {
            console.log('Grocery list changed:', payload);
            // Only update if it's the active list
            if (payload.new && payload.new.items && payload.new.is_active) {
              setGroceryItems(payload.new.items);
            } else if (payload.eventType === 'DELETE') {
              // If deleted, clear the list
              setGroceryItems([]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household]);

  const fetchGroceryList = async () => {
    setLoading(true);

    try {
      // Fetch active grocery list for this household
      const { data, error } = await supabase
        .from('grocery_lists')
        .select('*')
        .eq('household_id', household.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.items) {
        setGroceryItems(data.items);
      } else {
        setGroceryItems([]);
      }
    } catch (error) {
      console.error('Error fetching grocery list:', error);
    }

    setLoading(false);
  };


  const saveGroceryList = async (items) => {
    try {
      // Get current date for week calculation
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek;
      const weekStart = new Date(today.setDate(diff));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      // First, try to get existing list for this household
      const { data: existing } = await supabase
        .from('grocery_lists')
        .select('id')
        .eq('household_id', household.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing list
        const { error } = await supabase
          .from('grocery_lists')
          .update({
            items: items,
            week_start_date: weekStartStr,
            week_end_date: weekEndStr
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new list
        const { error } = await supabase
          .from('grocery_lists')
          .insert({
            household_id: household.id,
            items: items,
            week_start_date: weekStartStr,
            week_end_date: weekEndStr,
            is_active: true
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error saving grocery list:', error);
    }
  };

  const toggleItem = async (itemId) => {
    const updatedItems = groceryItems.map(item =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    setGroceryItems(updatedItems);
    await saveGroceryList(updatedItems);
  };

  const addManualItem = async () => {
    if (!newItem.trim()) return;

    // Auto-categorize based on keywords
    const name = newItem.toLowerCase();
    let category = 'Other';

    const ingredientCategories = {
      'Proteins': ['chicken', 'salmon', 'beef', 'pork', 'turkey', 'fish', 'eggs', 'tofu', 'meat'],
      'Vegetables': ['broccoli', 'carrots', 'spinach', 'lettuce', 'tomato', 'onion', 'pepper', 'zucchini', 'vegetables', 'veggies'],
      'Fruits': ['apple', 'banana', 'orange', 'berries', 'grapes', 'fruit'],
      'Grains': ['rice', 'pasta', 'bread', 'quinoa', 'oats', 'cereal'],
      'Dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream'],
      'Pantry': ['oil', 'salt', 'pepper', 'spices', 'sauce', 'sugar', 'flour']
    };

    for (const [cat, keywords] of Object.entries(ingredientCategories)) {
      if (keywords.some(keyword => name.includes(keyword))) {
        category = cat;
        break;
      }
    }

    const newGroceryItem = {
      id: `item-${Date.now()}`,
      name: newItem,
      category: category,
      checked: false,
      quantity: '1'
    };

    const updatedItems = [...groceryItems, newGroceryItem];
    setGroceryItems(updatedItems);
    await saveGroceryList(updatedItems);

    setNewItem('');
    setShowAddForm(false);
  };

  const deleteItem = async (itemId) => {
    const updatedItems = groceryItems.filter(item => item.id !== itemId);
    setGroceryItems(updatedItems);
    await saveGroceryList(updatedItems);
  };

  const groupByCategory = () => {
    const grouped = {};
    groceryItems.forEach(item => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">🛒 Grocery List</h2>
        <p className="text-slate-600">Loading grocery list...</p>
      </div>
    );
  }

  const groupedItems = groupByCategory();
  const completedCount = groceryItems.filter(item => item.checked).length;
  const totalCount = groceryItems.length;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-slate-700" />
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Grocery List</h2>
            <p className="text-sm text-slate-500">
              Shared list • {completedCount}/{totalCount} items
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="bg-slate-200 rounded-full h-3 overflow-hidden">
          <div 
            className="bg-green-500 h-full transition-all duration-300"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Add Item Form */}
      {showAddForm && (
        <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="e.g., 2 lbs chicken breast"
              className="flex-1 px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && addManualItem()}
            />
            <button
              onClick={addManualItem}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewItem('');
              }}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Grocery Items by Category */}
      {groceryItems.length === 0 ? (
        <div className="text-center py-8">
          <ShoppingCart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">No grocery items yet</p>
          <p className="text-sm text-slate-400">Click "Add Item" above to start your shared grocery list</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category}>
              <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                <span className="text-lg">{category}</span>
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                  {items.filter(i => i.checked).length}/{items.length}
                </span>
              </h3>
              
              <div className="space-y-2">
                {items.map(item => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      item.checked 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => toggleItem(item.id)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                          item.checked
                            ? 'bg-green-500 border-green-500'
                            : 'border-slate-300 hover:border-green-500'
                        }`}
                      >
                        {item.checked && <Check className="w-4 h-4 text-white" />}
                      </button>

                      <div className="flex-1">
                        <p className={`font-medium ${
                          item.checked ? 'text-slate-500 line-through' : 'text-slate-800'
                        }`}>
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500">{item.quantity}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {groceryItems.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => {
              const updatedItems = groceryItems.map(item => ({ ...item, checked: false }));
              setGroceryItems(updatedItems);
              saveGroceryList(updatedItems);
            }}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm"
          >
            Uncheck All
          </button>
        </div>
      )}
    </div>
  );
};

export default GroceryList;