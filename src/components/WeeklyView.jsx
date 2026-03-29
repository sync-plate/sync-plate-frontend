import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Calendar, Users, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

const WeeklyView = ({ user, household, refreshKey, onSelectDate }) => {
  const [weekData, setWeekData] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedMealId, setExpandedMealId] = useState(null);

  useEffect(() => {
    if (user) {
      fetchWeekData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshKey, weekOffset]);

  const localDateStr = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

  const getWeekDates = (offset = 0) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - dayOfWeek + offset * 7
    );
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
      dates.push(localDateStr(date));
    }
    return dates;
  };

  const getWeekRangeLabel = () => {
    const dates = getWeekDates(weekOffset);
    const fmt = (dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    return `${fmt(dates[0])} – ${fmt(dates[6])}`;
  };

  const fetchWeekData = async () => {
    setLoading(true);
    const dates = getWeekDates(weekOffset);

    try {
      // Fetch individual meals for this user
      const { data: individualMeals, error: individualError } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', user.id)
        .in('meal_date', dates);

      if (individualError) console.error('Error fetching individual meals:', individualError);

      // Fetch shared meals for household
      const { data: sharedMeals, error: sharedError } = await supabase
        .from('meals')
        .select('*')
        .eq('household_id', household.id)
        .in('meal_date', dates);

      if (sharedError) console.error('Error fetching shared meals:', sharedError);

      // Fetch any rebalance adjustments for this week
      const { data: adjustments } = await supabase
        .from('daily_target_adjustments')
        .select('*')
        .eq('user_id', user.id)
        .in('adjustment_date', dates);

      const validIndividual = individualMeals || [];
      const validShared = sharedMeals || [];
      const validAdjustments = adjustments || [];

      // Organize by date
      const weekMap = dates.map(date => {
        const dayIndividual = validIndividual.filter(m => m.meal_date === date);
        // Only shared meals where this user has a portion
        const dayShared = validShared.filter(m =>
          m.meal_date === date && m.portion_data && m.portion_data[user.id]
        );

        // Calculate total calories for this day
        let totalCalories = 0;

        dayIndividual.forEach(meal => {
          totalCalories += meal.calories || 0;
        });

        dayShared.forEach(meal => {
          totalCalories += meal.portion_data[user.id].calories || 0;
        });

        // Apply weekly rebalance adjustment if one exists from an earlier day this week
        const weeklyAdj = validAdjustments.find(a =>
          a.choice === 'weekly' && a.adjustment_date < date
        );
        const target = weeklyAdj
          ? Math.max(0, user.daily_calorie_target - weeklyAdj.weekly_reduction)
          : user.daily_calorie_target;
        const difference = totalCalories - target;

        return {
          date,
          meals: [...dayIndividual, ...dayShared],
          totalCalories,
          target,
          difference,
          dayName: (() => { const [y,m,d] = date.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US', { weekday: 'short' }); })(),
          dayNumber: Number(date.split('-')[2]),
          isToday: date === localDateStr()
        };
      });

      setWeekData(weekMap);
    } catch (error) {
      console.error('Error fetching week data:', error);
    }

    setLoading(false);
  };

  const getWeekSummary = () => {
    const totalConsumed = weekData.reduce((sum, day) => sum + day.totalCalories, 0);
    const totalTarget = user.daily_calorie_target * 7;
    const balance = totalConsumed - totalTarget;
    
    return {
      totalConsumed,
      totalTarget,
      balance,
      averageDaily: (() => {
      // Unlogged days assumed forgotten — count as daily target in the average
      const assumedTotal = weekData.reduce((sum, day) =>
        sum + (day.totalCalories > 0 ? day.totalCalories : user.daily_calorie_target), 0);
      return Math.round(assumedTotal / 7);
    })()
    };
  };

  const getDayColor = (day) => {
    if (day.totalCalories === 0) return 'bg-slate-100 border-slate-200';
    
    const percentDiff = (day.difference / day.target) * 100;
    
    if (percentDiff > 10) return 'bg-orange-100 border-orange-300'; // Grace day
    if (Math.abs(percentDiff) <= 10) return 'bg-green-100 border-green-300'; // On target
    return 'bg-blue-100 border-blue-300'; // Under target
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">📅 Weekly View</h2>
        <p className="text-slate-600">Loading week data...</p>
      </div>
    );
  }

  const summary = getWeekSummary();

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-slate-700" />
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Weekly View</h2>
            <p className="text-sm text-slate-500">{user.name}'s Week</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setWeekOffset(o => o - 1); setSelectedDay(null); }}
            className="p-2 bg-white rounded-xl shadow hover:bg-slate-100 transition-all border border-slate-200"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="text-sm font-semibold text-slate-700 min-w-[130px] text-center">
            {weekOffset === 0 ? 'This Week' : getWeekRangeLabel()}
          </span>
          <button
            onClick={() => { setWeekOffset(o => o + 1); setSelectedDay(null); }}
            className="p-2 bg-white rounded-xl shadow hover:bg-slate-100 transition-all border border-slate-200"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => { setWeekOffset(0); setSelectedDay(null); }}
              className="text-xs font-medium px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-all"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Weekly Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-600 mb-1">Weekly Target</p>
          <p className="text-lg font-bold text-slate-800">{summary.totalTarget.toLocaleString()}</p>
          <p className="text-xs text-slate-500">calories</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-600 mb-1">Consumed</p>
          <p className="text-lg font-bold text-slate-800">{summary.totalConsumed.toLocaleString()}</p>
          <p className="text-xs text-slate-500">calories</p>
        </div>

        <div className={`rounded-lg p-3 ${summary.balance >= 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
          <p className="text-xs text-slate-600 mb-1">Balance</p>
          <p className={`text-lg font-bold ${summary.balance >= 0 ? 'text-orange-700' : 'text-green-700'}`}>
            {summary.balance >= 0 ? '+' : ''}{summary.balance.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">{summary.balance >= 0 ? 'over' : 'under'}</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-600 mb-1">Daily Avg</p>
          <p className="text-lg font-bold text-slate-800">{summary.averageDaily.toLocaleString()}</p>
          <p className="text-xs text-slate-500">per day</p>
        </div>
      </div>

      {/* 7-Day Calendar */}
      <div className="grid grid-cols-7 gap-1 sm:gap-3 mb-6">
        {weekData.map((day, idx) => (
          <div
            key={idx}
            onClick={() => {
              setSelectedDay(day);
              setExpandedMealId(null);
              if (onSelectDate) onSelectDate(day.date);
            }}
            className={`${getDayColor(day)} border-2 rounded-xl p-1 sm:p-3 cursor-pointer hover:shadow-md transition-all ${
              day.isToday ? 'ring-2 ring-blue-500' : ''
            } ${day.date > localDateStr() ? 'border-dashed' : ''}`}
          >
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-600">{day.dayName}</p>
              <p className="text-base sm:text-2xl font-bold text-slate-800 my-0.5">{day.dayNumber}</p>

              {day.totalCalories > 0 ? (
                <>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{day.totalCalories}</p>
                  <p className="text-xs text-slate-500 hidden sm:block">cal</p>
                  <div className="mt-1 text-xs">
                    {day.difference > 0 ? (
                      <span className="text-orange-600 font-medium">+{day.difference}</span>
                    ) : day.difference < 0 ? (
                      <span className="text-green-600 font-medium">{day.difference}</span>
                    ) : (
                      <span className="text-green-600 font-medium">✓</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 mt-1 hidden sm:block">—</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs mb-6">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-green-100 border-2 border-green-300 rounded shrink-0"></div>
          <span className="text-slate-600">On Target</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-orange-100 border-2 border-orange-300 rounded shrink-0"></div>
          <span className="text-slate-600">Over</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-blue-100 border-2 border-blue-300 rounded shrink-0"></div>
          <span className="text-slate-600">Under</span>
        </div>
      </div>

      {/* Selected Day Details */}
      {selectedDay && (
        <div className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-slate-800">
                {selectedDay.dayName}, {(() => { const [y,m,d] = selectedDay.date.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); })()}
              </h3>
              <p className="text-sm text-slate-600">
                {selectedDay.totalCalories} / {selectedDay.target} calories
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onSelectDate && (
                <button
                  onClick={() => {
                    onSelectDate(selectedDay.date);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-all"
                >
                  + Add food for this day
                </button>
              )}
              <button
                onClick={() => setSelectedDay(null)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>
          </div>

          {selectedDay.meals.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No meals logged for this day</p>
          ) : (
            <div className="space-y-3">
              {selectedDay.meals.map((meal, idx) => {
                const isShared = meal.household_id !== null;
                const userPortion = isShared ? meal.portion_data?.[user.id] : null;
                const calories = userPortion ? userPortion.calories : meal.calories;
                const isExpanded = expandedMealId === (meal.id ?? idx);

                return (
                  <div key={meal.id ?? idx} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    {/* Always-visible row */}
                    <div className="flex justify-between items-center p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-500 uppercase">{meal.meal_type}</span>
                          {isShared && (
                            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                              <Users className="w-3 h-3" />Shared
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-800 truncate">{meal.custom_name || 'Meal'}</p>
                        <p className="text-sm text-slate-500">{meal.meal_time || 'Planned'}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-2">
                        <div className="text-right">
                          <p className="text-xl font-bold text-slate-800">{calories}</p>
                          <p className="text-xs text-slate-500">cal</p>
                        </div>
                        <button
                          onClick={() => setExpandedMealId(isExpanded ? null : (meal.id ?? idx))}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        <div className="flex gap-4 py-3 text-sm border-b border-slate-100 flex-wrap">
                          <span className="text-blue-600 font-medium">
                            Protein: <strong>{isShared ? (userPortion?.protein ?? 0) : (meal.protein_g ?? 0)}g</strong>
                          </span>
                          <span className="text-orange-600 font-medium">
                            Carbs: <strong>{isShared ? (userPortion?.carbs ?? 0) : (meal.carbs_g ?? 0)}g</strong>
                          </span>
                          <span className="text-purple-600 font-medium">
                            Fat: <strong>{isShared ? (userPortion?.fat ?? 0) : (meal.fat_g ?? 0)}g</strong>
                          </span>
                        </div>
                        {isShared && userPortion?.items && userPortion.items.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Your Portion Items</p>
                            <div className="space-y-1">
                              {userPortion.items.map((item, i) => (
                                <div key={i} className="flex justify-between text-sm text-slate-700">
                                  <span>{item.name}</span>
                                  <span className="font-medium text-slate-500">{item.amount}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WeeklyView;