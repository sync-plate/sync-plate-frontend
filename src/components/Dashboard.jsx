import React, { useState, useEffect } from 'react';
import { Users, Utensils, Apple, Coffee, Moon, Trash2, LogOut, Mail, Copy, Check, X, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import FoodInput from './FoodInput';
import WeeklyView from './WeeklyView';
import GroceryList from './GroceryList';

function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + days));
}

function formatDateLabel(dateStr) {
  const todayStr = localDateStr();
  const tomorrowStr = shiftDate(todayStr, 1);
  const yesterdayStr = shiftDate(todayStr, -1);
  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';
  if (dateStr === yesterdayStr) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

const Dashboard = ({ currentUserId }) => {
  const today = localDateStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const isPlanning = selectedDate > today;
  const [activePartner, setActivePartner] = useState('A');
  const [users, setUsers] = useState([]);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mealRefreshKey, setMealRefreshKey] = useState(0);
  const [weekAdjustments, setWeekAdjustments] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (users.length >= 1) {
      fetchMeals();
      fetchAdjustments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, activePartner, selectedDate]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function fetchUsers() {
    try {
      // First get the current user's household_id
      const { data: currentUser, error: currentUserError } = await supabase
        .from('users')
        .select('household_id')
        .eq('id', currentUserId)
        .single();

      if (currentUserError) throw currentUserError;
      if (!currentUser?.household_id) {
        setLoading(false);
        return;
      }

      // Only fetch users in the same household
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('household_id', currentUser.household_id)
        .order('name');

      if (error) throw error;
      setUsers(data);

      // Default active partner to the logged-in user
      if (currentUserId && data.length >= 2) {
        const loggedInIndex = data.findIndex(u => u.id === currentUserId);
        if (loggedInIndex === 1) setActivePartner('B');
        else setActivePartner('A');
      }

      // Fetch household invite code
      const { data: household } = await supabase
        .from('households')
        .select('invite_code')
        .eq('id', currentUser.household_id)
        .single();
      if (household) setInviteCode(household.invite_code);
    } catch (error) {
      console.error('Error fetching users:', error);
    }

    setLoading(false);
  }

  async function fetchMeals() {
    try {
      const partner = activePartner === 'A' ? users[0] : (users[1] || users[0]);

      // Fetch individual meals for this user
      const { data: individualMeals, error: individualError } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', partner.id)
        .eq('meal_date', selectedDate);

      if (individualError) {
        console.error('Error fetching individual meals:', individualError);
      }

      // Fetch shared meals for household
      const { data: sharedMeals, error: sharedError } = await supabase
        .from('meals')
        .select('*')
        .eq('household_id', users[0].household_id)
        .eq('meal_date', selectedDate);

      if (sharedError) {
        console.error('Error fetching shared meals:', sharedError);
      }

      const validIndividual = individualMeals || [];
      const validShared = sharedMeals || [];

      // Filter shared meals to only include those where this user has a portion
      const filteredSharedMeals = validShared.filter(meal =>
        meal.portion_data && meal.portion_data[partner.id]
      );

      setMeals([...validIndividual, ...filteredSharedMeals]);
      setMealRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Error fetching meals:', error);
    }
  }

  async function fetchAdjustments() {
    try {
      const partner = activePartner === 'A' ? users[0] : (users[1] || users[0]);
      // Compute the Sunday-start week containing selectedDate
      const [y, m, d] = selectedDate.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const dayOfWeek = date.getDay();
      const weekStart = localDateStr(new Date(y, m - 1, d - dayOfWeek));
      const weekEnd = localDateStr(new Date(y, m - 1, d - dayOfWeek + 6));

      const { data } = await supabase
        .from('daily_target_adjustments')
        .select('*')
        .eq('user_id', partner.id)
        .gte('adjustment_date', weekStart)
        .lte('adjustment_date', weekEnd);

      setWeekAdjustments(data || []);
    } catch (error) {
      console.error('Error fetching adjustments:', error);
    }
  }

  async function handleDeleteMeal(mealId, isShared) {
    if (!window.confirm('Are you sure you want to delete this meal?')) {
      return;
    }

    try {
      const partner = activePartner === 'A' ? users[0] : users[1];

      if (isShared) {
        // For shared meals, remove only this user's portion
        const { data: meal, error: fetchError } = await supabase
          .from('meals')
          .select('portion_data')
          .eq('id', mealId)
          .single();

        if (fetchError) throw fetchError;

        // Remove this user's portion from the portion_data
        const updatedPortionData = { ...meal.portion_data };
        delete updatedPortionData[partner.id];

        // Check if any portions remain
        const remainingUsers = Object.keys(updatedPortionData);

        if (remainingUsers.length === 0) {
          // No users left, delete the entire meal
          const { error: deleteError } = await supabase
            .from('meals')
            .delete()
            .eq('id', mealId);

          if (deleteError) throw deleteError;
        } else {
          // Update the meal with remaining portions
          const { error: updateError } = await supabase
            .from('meals')
            .update({ portion_data: updatedPortionData })
            .eq('id', mealId);

          if (updateError) throw updateError;
        }
      } else {
        // For individual meals, delete the entire meal
        const { error } = await supabase
          .from('meals')
          .delete()
          .eq('id', mealId);

        if (error) throw error;
      }

      // Refresh meals after deletion
      fetchMeals();
    } catch (error) {
      console.error('Error deleting meal:', error);
      alert('Failed to delete meal: ' + error.message);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-8">Loading...</div>;
  }

  if (users.length === 0) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Setting up your account... please refresh in a moment.</div>;
  }

  const isSolo = users.length === 1;
  const partnerA = users[0];
  const partnerB = users[1] || null;
  const partner = isSolo ? partnerA : (activePartner === 'A' ? partnerA : partnerB);

  // Organize meals by type — returns all entries for a given type
  const getMealsByType = (type) => {
    return meals
      .filter(m => m.meal_type === type)
      .map(meal => {
        const isShared = meal.household_id !== null;
        const calories = isShared && meal.portion_data?.[partner.id]
          ? meal.portion_data[partner.id].calories
          : meal.calories;
        return {
          id: meal.id,
          name: meal.custom_name || 'Meal',
          calories,
          time: meal.meal_time,
          isShared,
          isPlanned: meal.is_planned,
          protein: meal.protein_g,
          carbs: meal.carbs_g,
          fat: meal.fat_g
        };
      });
  };

  const mealsByType = {
    breakfast: getMealsByType('breakfast'),
    lunch: getMealsByType('lunch'),
    dinner: getMealsByType('dinner'),
    snack: getMealsByType('snack')
  };

  const totalCalories = meals.reduce((sum, meal) => {
    const isShared = meal.household_id !== null;
    const calories = isShared && meal.portion_data?.[partner.id]
      ? meal.portion_data[partner.id].calories
      : meal.calories;
    return sum + (calories || 0);
  }, 0);

  const totalProtein = Math.round(meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0) * 10) / 10;
  const totalCarbs = Math.round(meals.reduce((sum, meal) => sum + (meal.carbs_g || 0), 0) * 10) / 10;
  const totalFat = Math.round(meals.reduce((sum, meal) => sum + (meal.fat_g || 0), 0) * 10) / 10;

  // Apply any active weekly rebalance adjustment to this day's target
  const weeklyAdj = weekAdjustments.find(a =>
    a.choice === 'weekly' && a.adjustment_date < selectedDate
  );
  const dailyAdj = weekAdjustments.find(a =>
    a.choice === 'daily' && a.adjustment_date === selectedDate
  );
  const effectiveTarget = weeklyAdj
    ? Math.max(0, partner.daily_calorie_target - weeklyAdj.weekly_reduction)
    : partner.daily_calorie_target;

  const remaining = effectiveTarget - totalCalories;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-1">Sync-Plate</h1>
            <p className="text-sm sm:text-base text-slate-600">Calorie tracking for couples</p>
          </div>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-all font-medium shadow"
            >
              <UserPlus className="w-4 h-4" />
              Invite Partner
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-xl hover:bg-slate-100 transition-all font-medium shadow border border-slate-200"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Invite Modal */}
        {showInvite && (
          <InviteModal
            inviteCode={inviteCode}
            inviteEmail={inviteEmail}
            setInviteEmail={setInviteEmail}
            copied={copied}
            setCopied={setCopied}
            onClose={() => { setShowInvite(false); setInviteEmail(''); }}
          />
        )}

        {/* Date Navigator */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            className="p-2 bg-white rounded-xl shadow hover:bg-slate-100 transition-all border border-slate-200"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-bold ${isPlanning ? 'text-indigo-700' : 'text-slate-800'}`}>
              {formatDateLabel(selectedDate)}
            </span>
            {selectedDate !== today && (
              <button
                onClick={() => setSelectedDate(today)}
                className="text-xs font-medium px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-all"
              >
                Today
              </button>
            )}
          </div>
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            className="p-2 bg-white rounded-xl shadow hover:bg-slate-100 transition-all border border-slate-200"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Solo invite banner */}
        {isSolo && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 mb-6 flex items-center justify-between">
            <div>
              <p className="font-bold text-blue-800">You're tracking solo</p>
              <p className="text-sm text-blue-600">Invite your partner to enable shared meals and couple features.</p>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all"
            >
              Invite Partner
            </button>
          </div>
        )}

        {/* Partner Toggle — hidden when solo */}
        {!isSolo && (
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => setActivePartner('A')}
              className={`flex-1 p-6 rounded-2xl shadow-lg transition-all ${
                activePartner === 'A'
                  ? 'bg-gradient-to-r from-rose-400 to-pink-500 text-white scale-105'
                  : 'bg-white text-slate-700 hover:shadow-xl'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{partnerA.name}</h2>
                  <p className={`text-sm ${activePartner === 'A' ? 'text-rose-100' : 'text-slate-500'}`}>
                    {partnerA.age} years • {partnerA.weight}kg • {partnerA.height}cm
                  </p>
                </div>
                <Users className="w-8 h-8" />
              </div>
            </button>

            <button
              onClick={() => setActivePartner('B')}
              className={`flex-1 p-6 rounded-2xl shadow-lg transition-all ${
                activePartner === 'B'
                  ? 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white scale-105'
                  : 'bg-white text-slate-700 hover:shadow-xl'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{partnerB.name}</h2>
                  <p className={`text-sm ${activePartner === 'B' ? 'text-blue-100' : 'text-slate-500'}`}>
                    {partnerB.age} years • {partnerB.weight}kg • {partnerB.height}cm
                  </p>
                </div>
                <Users className="w-8 h-8" />
              </div>
            </button>
          </div>
        )}

        {/* Daily Progress */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-slate-800">{isPlanning ? `${formatDateLabel(selectedDate)}'s Plan` : "Today's Progress"}</h3>
            <span className={`text-2xl font-bold ${
              activePartner === 'A' ? 'text-rose-600' : 'text-blue-600'
            }`}>
              {totalCalories} / {effectiveTarget} cal
            </span>
          </div>
          {weeklyAdj && (
            <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
              Weekly rebalance active: target reduced by {weeklyAdj.weekly_reduction} cal/day to offset a previous overage.
            </div>
          )}
          {dailyAdj && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
              Rebalancing today: aim for ~{dailyAdj.daily_reduction} cal less per remaining meal.
            </div>
          )}
          <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full ${
                activePartner === 'A'
                  ? 'bg-gradient-to-r from-rose-400 to-pink-500'
                  : 'bg-gradient-to-r from-blue-400 to-indigo-500'
              }`}
              style={{ width: `${Math.min((totalCalories / effectiveTarget) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-slate-600">
              BMR: {partner.bmr} cal
            </span>
            <span className={remaining >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
              {remaining >= 0 ? `${remaining} cal remaining` : `${Math.abs(remaining)} cal over`}
            </span>
          </div>
          {meals.length > 0 && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 text-sm">
              <span className="text-blue-600 font-medium">🥩 Protein: <strong>{totalProtein}g</strong></span>
              <span className="text-orange-600 font-medium">🍞 Carbs: <strong>{totalCarbs}g</strong></span>
              <span className="text-purple-600 font-medium">🧈 Fat: <strong>{totalFat}g</strong></span>
            </div>
          )}
        </div>

        {/* AI Food Input */}
        <FoodInput
          activePartner={activePartner}
          partnerA={partnerA}
          partnerB={partnerB}
          householdId={partnerA.household_id}
          onMealAdded={fetchMeals}
          mealDate={selectedDate}
          isSolo={isSolo}
        />

        {/* Meals Grid */}
        <div className="grid gap-4 mb-6">
          <MealTypeCard icon={Coffee} title="Breakfast" meals={mealsByType.breakfast} color={activePartner} onDelete={handleDeleteMeal} isPlanning={isPlanning} />
          <MealTypeCard icon={Apple}   title="Lunch"     meals={mealsByType.lunch}     color={activePartner} onDelete={handleDeleteMeal} isPlanning={isPlanning} />
          <MealTypeCard icon={Utensils} title="Dinner"   meals={mealsByType.dinner}    color={activePartner} onDelete={handleDeleteMeal} isPlanning={isPlanning} />
          <MealTypeCard icon={Moon}    title="Snack"     meals={mealsByType.snack}     color={activePartner} onDelete={handleDeleteMeal} isPlanning={isPlanning} />
        </div>

        {/* Weekly View */}
        <WeeklyView user={partner} household={{ id: partnerA.household_id }} refreshKey={mealRefreshKey} onSelectDate={setSelectedDate} />

        {/* Grocery List */}
        <GroceryList
          household={{ id: partnerA.household_id }}
        />

        {/* Key Feature Callout */}
        {!isSolo && (
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl shadow-lg p-6 text-white">
            <h3 className="text-xl font-bold mb-2">🎯 How Couple-Sync Works</h3>
            <p className="text-purple-50 mb-3">
              Click between {partnerA.name} and {partnerB.name} above to see how the <strong>same dinner</strong> shows
              different portions based on each person's calorie target.
            </p>
            <ul className="space-y-2 text-sm text-purple-50">
              <li>✅ One recipe stored in the database</li>
              <li>✅ One grocery list generated</li>
              <li>✅ Portions calculated individually based on BMR + goals</li>
              <li>✅ Any meal can be shared or kept individual</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

// Invite Modal
const InviteModal = ({ inviteCode, inviteEmail, setInviteEmail, copied, setCopied, onClose }) => {
  const [sending, setSending] = React.useState(false);
  const [sendResult, setSendResult] = React.useState(null); // 'sent' | 'error' | null

  function copyCode() {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendEmailInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch(
        'https://rrljtsaravnmoxyzuejp.supabase.co/functions/v1/invite-partner',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email: inviteEmail, invite_code: inviteCode }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setSendResult('sent');
      setInviteEmail('');
    } catch (err) {
      console.error('Invite error:', err);
      setSendResult('error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Invite Your Partner</h2>
        </div>

        {/* Invite code display */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-5 mb-6 text-center">
          <p className="text-sm text-slate-500 mb-2">Household invite code</p>
          <p className="text-4xl font-bold tracking-widest text-purple-700 font-mono mb-3">{inviteCode}</p>
          <button
            onClick={copyCode}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-purple-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-purple-50 transition-all"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Email invite */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">Or send an email invite</p>
          <form onSubmit={sendEmailInvite} className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setSendResult(null); }}
                placeholder="partner@email.com"
                className="w-full pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 text-sm"
                disabled={sending}
                required
              />
            </div>
            <button
              type="submit"
              disabled={sending || !inviteEmail.trim()}
              className="px-4 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all text-sm font-medium"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
          {sendResult === 'sent' && (
            <p className="text-sm text-green-600 font-medium mt-2 flex items-center gap-1">
              <Check className="w-4 h-4" /> Invite sent! They'll receive an email to join.
            </p>
          )}
          {sendResult === 'error' && (
            <p className="text-sm text-red-600 mt-2">Failed to send invite. Try copying the code instead.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Grouped card showing all entries for one meal type
const MealTypeCard = ({ icon: Icon, title, meals, color, onDelete, isPlanning }) => {
  const iconBg = { A: 'bg-rose-50', B: 'bg-blue-50' };
  const iconColor = { A: 'text-rose-600', B: 'text-blue-600' };
  const totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);

  if (meals.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-dashed border-slate-200 opacity-50">
        <div className="flex items-center gap-4">
          <div className={`${iconBg[color]} p-3 rounded-xl`}>
            <Icon className={`w-6 h-6 ${iconColor[color]}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <p className="text-slate-400 text-sm">{isPlanning ? 'No meals planned yet' : 'No meal logged yet'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-slate-200">
      {/* Type header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`${iconBg[color]} p-3 rounded-xl`}>
            <Icon className={`w-6 h-6 ${iconColor[color]}`} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        </div>
        <span className={`text-sm font-semibold ${color === 'A' ? 'text-rose-600' : 'text-blue-600'}`}>
          {totalCalories} cal total
        </span>
      </div>

      {/* Individual entries */}
      <div className="space-y-2">
        {meals.map((meal, idx) => (
          <div
            key={meal.id}
            className={`px-4 py-3 rounded-xl ${
              meal.isShared ? 'bg-purple-50 border border-purple-200' : 'bg-slate-50 border border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-slate-400 w-4 shrink-0">{idx + 1}.</span>
                <span className="text-slate-700 font-medium truncate">{meal.name}</span>
                {meal.isShared && (
                  <span className="flex items-center gap-1 text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
                    <Users className="w-3 h-3" />
                    Shared
                  </span>
                )}
                {meal.isPlanned && (
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                    Planned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className="text-slate-800 font-bold">{meal.calories} cal</span>
                <span className="text-slate-400 text-xs hidden sm:block">{meal.time}</span>
                <button
                  onClick={() => onDelete(meal.id, meal.isShared)}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                  title={meal.isShared ? "Remove your portion" : "Delete"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-1.5 ml-6 text-xs">
              <span className="text-blue-600 font-medium">🥩 {meal.protein ?? 0}g</span>
              <span className="text-orange-600 font-medium">🍞 {meal.carbs ?? 0}g</span>
              <span className="text-purple-600 font-medium">🧈 {meal.fat ?? 0}g</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
