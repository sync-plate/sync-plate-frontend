import React, { useState } from 'react';
import { parseNaturalLanguageFood } from '../lib/openaiClient';
import { supabase } from '../lib/supabaseClient';
import RebalanceModal from './RebalanceModal';

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

const FoodInput = ({ activePartner, partnerA, partnerB, householdId, onMealAdded, mealDate, isSolo }) => {
  const [input, setInput] = useState('');
  const [mealType, setMealType] = useState('snack');
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [rebalanceData, setRebalanceData] = useState(null);
  const [isMealPrep, setIsMealPrep] = useState(false);
  const [prepDays, setPrepDays] = useState(5);
  const [servingsA, setServingsA] = useState(1);
  const [servingsB, setServingsB] = useState(1);

  const partner = activePartner === 'A' ? partnerA : partnerB;
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const isPlanning = mealDate > todayStr;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await parseNaturalLanguageFood(input);

      if (!response.success) {
        setError(response.error);
        setLoading(false);
        return;
      }

      if (isShared && !isSolo) {
        await handleSharedMeal(response.data, response.source);
      } else {
        await handleIndividualMeal(response.data, response.source);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleIndividualMeal = async (parsedData, responseSource) => {
    try {
      if (isMealPrep) {
        const totalProtein = parsedData.items.reduce((sum, item) => sum + (item.protein || 0), 0);
        const totalCarbs = parsedData.items.reduce((sum, item) => sum + (item.carbs || 0), 0);
        const totalFat = parsedData.items.reduce((sum, item) => sum + (item.fat || 0), 0);

        const rows = [];
        for (let i = 0; i < prepDays; i++) {
          rows.push({
            user_id: partner.id,
            meal_date: shiftDate(mealDate, i),
            meal_type: mealType,
            meal_time: null,
            custom_name: parsedData.items.map(item => item.name).join(', '),
            calories: Math.round(parsedData.total_calories * servingsA),
            protein_g: Math.round(totalProtein * servingsA * 10) / 10,
            carbs_g: Math.round(totalCarbs * servingsA * 10) / 10,
            fat_g: Math.round(totalFat * servingsA * 10) / 10,
            is_planned: true,
            is_unplanned: false
          });
        }

        const { error: dbError } = await supabase.from('meals').insert(rows);
        if (dbError) throw dbError;

        setResult({
          type: 'mealPrep',
          data: parsedData,
          partner: partner.name,
          source: responseSource || 'Unknown',
          prepDays,
          servingsA,
          startDate: mealDate,
          scaledCalories: Math.round(parsedData.total_calories * servingsA)
        });

        setInput('');
        if (onMealAdded) await onMealAdded();
      } else {
        const mealData = {
          user_id: partner.id,
          meal_date: mealDate,
          meal_type: mealType,
          meal_time: isPlanning ? null : new Date().toTimeString().split(' ')[0],
          custom_name: parsedData.items.map(item => item.name).join(', '),
          calories: parsedData.total_calories,
          protein_g: parsedData.items.reduce((sum, item) => sum + (item.protein || 0), 0),
          carbs_g: parsedData.items.reduce((sum, item) => sum + (item.carbs || 0), 0),
          fat_g: parsedData.items.reduce((sum, item) => sum + (item.fat || 0), 0),
          is_planned: isPlanning,
          is_unplanned: !isPlanning
        };

        const { error: dbError } = await supabase.from('meals').insert([mealData]);
        if (dbError) throw dbError;

        setResult({
          type: 'individual',
          data: parsedData,
          partner: partner.name,
          source: responseSource || 'Unknown',
          isPlanning,
          mealDate
        });

        setInput('');
        if (onMealAdded) await onMealAdded();

        if (!isPlanning) {
          await checkForOverageAndTriggerModal(parsedData, mealData.custom_name);
        }
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      setError('Failed to save meal: ' + dbError.message);
    }

    setLoading(false);
  };

  const checkForOverageAndTriggerModal = async (parsedData, itemName) => {
    try {
      const td = new Date();
      const today = `${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,'0')}-${String(td.getDate()).padStart(2,'0')}`;

      // Don't re-trigger if the user already made a rebalance choice today
      const { data: existingAdj } = await supabase
        .from('daily_target_adjustments')
        .select('id')
        .eq('user_id', partner.id)
        .eq('adjustment_date', today)
        .limit(1);
      if (existingAdj && existingAdj.length > 0) return;

      const [{ data: individualMeals, error: mealsError }, { data: sharedMeals, error: sharedError }] = await Promise.all([
        supabase.from('meals').select('*').eq('user_id', partner.id).eq('meal_date', today),
        supabase.from('meals').select('*').eq('household_id', householdId).eq('meal_date', today)
      ]);

      if (mealsError) throw mealsError;
      if (sharedError) throw sharedError;

      const validShared = (sharedMeals || []).filter(m => m.portion_data?.[partner.id]);
      const allMeals = [...(individualMeals || []), ...validShared];

      const todayTotal =
        (individualMeals || []).reduce((sum, m) => sum + (m.calories || 0), 0) +
        validShared.reduce((sum, m) => sum + (m.portion_data[partner.id].calories || 0), 0);

      if (todayTotal > partner.daily_calorie_target) {
        const overage = todayTotal - partner.daily_calorie_target;

        const loggedMealTypes = new Set(allMeals.map(m => m.meal_type));
        const allMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        const remainingMeals = allMealTypes.filter(type => !loggedMealTypes.has(type)).length;

        const dayOfWeek = td.getDay();
        const daysLeftInWeek = dayOfWeek === 0 ? 6 : 7 - dayOfWeek;

        setRebalanceData({
          overage,
          remainingMealsToday: remainingMeals,
          daysLeftInWeek,
          unplannedItem: {
            name: itemName,
            calories: parsedData.total_calories,
            time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          }
        });

        setTimeout(() => {
          setShowRebalanceModal(true);
        }, 3500);
      }
    } catch (error) {
      console.error('Error checking for overage:', error);
    }
  };

  const handleSharedMeal = async (parsedData, responseSource) => {
    try {
      const totalCalories = parsedData.total_calories;
      const totalProtein = parsedData.items.reduce((sum, item) => sum + (item.protein || 0), 0);
      const totalCarbs = parsedData.items.reduce((sum, item) => sum + (item.carbs || 0), 0);
      const totalFat = parsedData.items.reduce((sum, item) => sum + (item.fat || 0), 0);

      const totalTarget = partnerA.daily_calorie_target + partnerB.daily_calorie_target;
      const ratioA = totalTarget > 0 ? partnerA.daily_calorie_target / totalTarget : 0.5;
      const ratioB = totalTarget > 0 ? partnerB.daily_calorie_target / totalTarget : 0.5;

      const portionA = {
        calories: Math.round(totalCalories * ratioA),
        protein: Math.round(totalProtein * ratioA * 10) / 10,
        carbs: Math.round(totalCarbs * ratioA * 10) / 10,
        fat: Math.round(totalFat * ratioA * 10) / 10,
        items: parsedData.items.map(item => ({
          name: item.name,
          amount: `${Math.round(item.quantity * ratioA)}${item.unit}`
        }))
      };

      const portionB = {
        calories: Math.round(totalCalories * ratioB),
        protein: Math.round(totalProtein * ratioB * 10) / 10,
        carbs: Math.round(totalCarbs * ratioB * 10) / 10,
        fat: Math.round(totalFat * ratioB * 10) / 10,
        items: parsedData.items.map(item => ({
          name: item.name,
          amount: `${Math.round(item.quantity * ratioB)}${item.unit}`
        }))
      };

      if (isMealPrep) {
        const rows = [];
        for (let i = 0; i < prepDays; i++) {
          const date = shiftDate(mealDate, i);
          rows.push({
            household_id: householdId,
            meal_date: date,
            meal_type: mealType,
            meal_time: null,
            custom_name: parsedData.items.map(item => item.name).join(', '),
            calories: portionA.calories + portionB.calories,
            protein_g: Math.round((portionA.protein + portionB.protein) * 10) / 10,
            carbs_g: Math.round((portionA.carbs + portionB.carbs) * 10) / 10,
            fat_g: Math.round((portionA.fat + portionB.fat) * 10) / 10,
            portion_data: { [partnerA.id]: portionA, [partnerB.id]: portionB },
            is_planned: true
          });
        }

        const { error: dbError } = await supabase.from('meals').insert(rows);
        if (dbError) throw dbError;

        setResult({
          type: 'mealPrepShared',
          data: parsedData,
          portionA,
          portionB,
          partnerAName: partnerA.name,
          partnerBName: partnerB.name,
          source: responseSource || 'Unknown',
          prepDays,
          startDate: mealDate
        });

        setInput('');
        if (onMealAdded) await onMealAdded();
      } else {
        const portionData = {
          [partnerA.id]: portionA,
          [partnerB.id]: portionB
        };

        const mealData = {
          household_id: householdId,
          meal_date: mealDate,
          meal_type: mealType,
          meal_time: isPlanning ? null : new Date().toTimeString().split(' ')[0],
          custom_name: parsedData.items.map(item => item.name).join(', '),
          calories: totalCalories,
          protein_g: totalProtein,
          carbs_g: totalCarbs,
          fat_g: totalFat,
          portion_data: portionData,
          is_planned: isPlanning
        };

        const { error: dbError } = await supabase.from('meals').insert([mealData]);
        if (dbError) throw dbError;

        setResult({
          type: 'shared',
          data: parsedData,
          portionA: portionA,
          portionB: portionB,
          partnerAName: partnerA.name,
          partnerBName: partnerB.name,
          source: responseSource || 'Unknown'
        });

        setInput('');
        if (onMealAdded) await onMealAdded();
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      setError('Failed to save shared meal: ' + dbError.message);
    }

    setLoading(false);
  };

  const handleMealTypeChange = (type) => {
    setMealType(type);
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">🤖 AI Food Logger</h2>
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${
          isPlanning
            ? 'bg-indigo-100 text-indigo-700'
            : activePartner === 'A'
              ? 'bg-rose-100 text-rose-700'
              : 'bg-blue-100 text-blue-700'
        }`}>
          {isPlanning
            ? `Planning for ${new Date(mealDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
            : isShared ? 'Shared Meal' : `Logging for ${partner.name}`}
        </span>
      </div>

      {/* Meal Type Selector — hidden when Meal Prep is active (prep section has its own) */}
      {!isMealPrep && (
        <div className="flex gap-2 mb-4">
          {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => handleMealTypeChange(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mealType === type
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Shared Meal Checkbox — hidden when solo (no partner yet) */}
      {!isSolo && (
        <div className="mb-4 p-3 bg-purple-50 border-2 border-purple-200 rounded-lg">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="ml-2 text-sm font-medium text-purple-800">
              🍽️ This is a shared meal (both partners eating together)
            </span>
          </label>
        </div>
      )}

      {/* Meal Prep Toggle */}
      <div className="mb-4 p-3 bg-green-50 border-2 border-green-200 rounded-lg">
        <label className="flex items-center cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={isMealPrep}
            onChange={e => setIsMealPrep(e.target.checked)}
            className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
          />
          <span className="ml-2 text-sm font-medium text-green-800">
            🥡 Meal Prep — repeat this meal for multiple days
          </span>
        </label>

        {isMealPrep && (
          <>
            {/* Days selector */}
            <div className="flex gap-2 mb-3">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPrepDays(n)}
                  className={`px-3 py-1 rounded-full text-sm font-semibold transition-all ${
                    prepDays === n
                      ? 'bg-green-500 text-white shadow-md'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-green-100'
                  }`}
                >
                  {n}d
                </button>
              ))}
            </div>

            {/* Meal type selector for prep */}
            <div className="flex gap-2 mb-3">
              {['breakfast', 'lunch', 'dinner', 'snack'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    mealType === type
                      ? 'bg-green-500 text-white shadow-md'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-green-100'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>

            {/* Servings input — individual only; shared meals use ratio split, no servings needed */}
            {!isShared && (
              <label className="flex flex-col gap-1 text-sm font-medium text-green-800">
                {partner.name}: servings/day
                <input
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={servingsA}
                  onChange={e => setServingsA(Number(e.target.value))}
                  className="mt-1 w-32 px-3 py-1.5 border border-green-300 rounded-lg focus:outline-none focus:border-green-500 text-slate-800"
                />
              </label>
            )}
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isShared
                ? "e.g., 'Grilled salmon with vegetables for 2'"
                : "e.g., 'handful of walnuts' or '100g chicken breast'"
            }
            className="flex-1 px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
          >
            {loading
              ? (isMealPrep ? 'Prepping...' : 'Parsing...')
              : isMealPrep
                ? `Prep ${prepDays} Day${prepDays > 1 ? 's' : ''}`
                : isPlanning
                  ? 'Plan Meal'
                  : 'Log Food'}
          </button>
        </div>
      </form>

      {/* Results for Meal Prep (individual) */}
      {result && result.type === 'mealPrep' && (
        <div className="bg-teal-50 border-2 border-teal-300 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-teal-800">
              ✅ Prepped {result.prepDays} day{result.prepDays > 1 ? 's' : ''} of {result.data.items.map(i => i.name).join(', ')} starting {new Date(result.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}!
            </h3>
            <div className="flex items-center gap-2">
              {result.source && (
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  result.source.includes('USDA')
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {result.source.includes('USDA') ? '📊 USDA Data' : '🤖 AI Estimate'}
                </span>
              )}
              <button onClick={() => setResult(null)} className="text-teal-500 hover:text-teal-700 font-bold text-lg leading-none px-1">×</button>
            </div>
          </div>
          <div className="bg-teal-100 rounded-lg p-3 border border-teal-300">
            <p className="text-teal-800 font-semibold">
              {result.partner}: {result.scaledCalories} cal/day
              {result.servingsA !== 1 && ` (${result.servingsA}× serving)`}
            </p>
            <p className="text-teal-700 text-sm mt-1">
              Saved as planned meals for {result.prepDays} consecutive day{result.prepDays > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Results for Meal Prep (shared) */}
      {result && result.type === 'mealPrepShared' && (
        <div className="bg-teal-50 border-2 border-teal-300 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-teal-800">
              ✅ Prepped {result.prepDays} day{result.prepDays > 1 ? 's' : ''} of {result.data.items.map(i => i.name).join(', ')} starting {new Date(result.startDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}!
            </h3>
            <div className="flex items-center gap-2">
              {result.source && (
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  result.source.includes('USDA')
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {result.source.includes('USDA') ? '📊 USDA Data' : '🤖 AI Estimate'}
                </span>
              )}
              <button onClick={() => setResult(null)} className="text-teal-500 hover:text-teal-700 font-bold text-lg leading-none px-1">×</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white rounded-lg p-3 border-2 border-rose-200">
              <p className="font-bold text-rose-700 text-sm mb-1">{result.partnerAName}</p>
              <p className="text-xl font-bold text-slate-800">{result.portionA.calories} cal/day</p>
            </div>
            <div className="bg-white rounded-lg p-3 border-2 border-blue-200">
              <p className="font-bold text-blue-700 text-sm mb-1">{result.partnerBName}</p>
              <p className="text-xl font-bold text-slate-800">{result.portionB.calories} cal/day</p>
            </div>
          </div>
          <div className="bg-teal-100 rounded-lg p-3 border border-teal-300">
            <p className="text-teal-700 text-sm">
              Saved as planned meals for {result.prepDays} consecutive day{result.prepDays > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Results for Individual Meal */}
      {result && result.type === 'individual' && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-green-800">
              {result.isPlanning
                ? `✅ Planned for ${new Date(result.mealDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}!`
                : `✅ Saved to ${result.partner}'s ${mealType}!`}
            </h3>
            <div className="flex items-center gap-2">
              {result.source && (
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  result.source.includes('USDA')
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {result.source.includes('USDA') ? '📊 USDA Data' : '🤖 AI Estimate'}
                </span>
              )}
              <button onClick={() => setResult(null)} className="text-green-500 hover:text-green-700 font-bold text-lg leading-none px-1">×</button>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {result.data.items.map((item, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="text-sm text-slate-600">
                      {item.quantity}{item.unit} {item.grams && `(${item.grams}g)`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-800">{item.calories}</p>
                    <p className="text-xs text-slate-500">calories</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-200">
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Protein</p>
                    <p className="text-sm font-bold text-blue-600">{item.protein}g</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Carbs</p>
                    <p className="text-sm font-bold text-orange-600">{item.carbs}g</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Fat</p>
                    <p className="text-sm font-bold text-purple-600">{item.fat}g</p>
                  </div>
                </div>

                {(item.fiber > 0 || item.sugar > 0) && (
                  <div className="flex gap-4 mt-2 text-xs text-slate-600">
                    {item.fiber > 0 && <span>Fiber: {item.fiber}g</span>}
                    {item.sugar > 0 && <span>Sugar: {item.sugar}g</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-green-100 rounded-lg p-3 border border-green-300">
            <p className="text-green-800 font-bold">
              Total: {result.data.total_calories} calories
            </p>
          </div>
        </div>
      )}

      {/* Results for Shared Meal */}
      {result && result.type === 'shared' && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-purple-800">
              ✅ Saved as shared {mealType} for both partners!
            </h3>
            <div className="flex items-center gap-2">
              {result.source && (
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  result.source.includes('USDA')
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {result.source.includes('USDA') ? '📊 USDA Data' : '🤖 AI Estimate'}
                </span>
              )}
              <button onClick={() => setResult(null)} className="text-purple-500 hover:text-purple-700 font-bold text-lg leading-none px-1">×</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-lg p-3 border-2 border-rose-200">
              <p className="font-bold text-rose-700 mb-2">{result.partnerAName}'s Portion</p>
              <p className="text-2xl font-bold text-slate-800 mb-2">{result.portionA.calories} cal</p>
              <div className="text-xs text-slate-600 mb-2">
                P: {result.portionA.protein}g • C: {result.portionA.carbs}g • F: {result.portionA.fat}g
              </div>
              {result.portionA.items.map((item, idx) => (
                <p key={idx} className="text-sm text-slate-700">
                  {item.name}: <strong>{item.amount}</strong>
                </p>
              ))}
            </div>

            <div className="bg-white rounded-lg p-3 border-2 border-blue-200">
              <p className="font-bold text-blue-700 mb-2">{result.partnerBName}'s Portion</p>
              <p className="text-2xl font-bold text-slate-800 mb-2">{result.portionB.calories} cal</p>
              <div className="text-xs text-slate-600 mb-2">
                P: {result.portionB.protein}g • C: {result.portionB.carbs}g • F: {result.portionB.fat}g
              </div>
              {result.portionB.items.map((item, idx) => (
                <p key={idx} className="text-sm text-slate-700">
                  {item.name}: <strong>{item.amount}</strong>
                </p>
              ))}
            </div>
          </div>

          <div className="bg-purple-100 rounded-lg p-3 border border-purple-300">
            <p className="text-purple-800 font-bold">
              💡 Portions calculated based on each person's daily calorie target!
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <p className="text-red-800">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {/* Rebalance Modal */}
      <RebalanceModal
        isOpen={showRebalanceModal}
        onClose={() => setShowRebalanceModal(false)}
        overage={rebalanceData?.overage || 0}
        user={partner}
        remainingMealsToday={rebalanceData?.remainingMealsToday || 0}
        daysLeftInWeek={rebalanceData?.daysLeftInWeek || 6}
        unplannedItem={rebalanceData?.unplannedItem}
      />
    </div>
  );
};

export default FoodInput;
