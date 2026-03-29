import React, { useState } from 'react';
import { AlertTriangle, Calendar, TrendingDown, Heart, ChevronRight, X, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const RebalanceModal = ({ isOpen, onClose, overage, user, remainingMealsToday, daysLeftInWeek, unplannedItem }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!isOpen) return null;

  // Safety checks
  const safeOverage = overage || 0;
  const safeRemainingMeals = remainingMealsToday || 0;
  const safeDaysLeft = daysLeftInWeek || 6;
  const dailyTarget = user?.daily_calorie_target || 2000;
  const weeklyTarget = user?.weekly_calorie_target || dailyTarget * 7;

  // Calculate rebalance options
  const dailyRebalanceAmount = safeRemainingMeals > 0
    ? Math.round(safeOverage / safeRemainingMeals)
    : safeOverage;

  const weeklyRebalanceAmount = safeDaysLeft > 0
    ? Math.round(safeOverage / safeDaysLeft)
    : safeOverage;

  const weeklyImpact = {
    targetWeekly: weeklyTarget,
    newWeekly: weeklyTarget + safeOverage,
    percentOver: ((safeOverage / weeklyTarget) * 100).toFixed(1)
  };

  // Rebalance options data
  const rebalanceOptions = {
    daily: {
      title: 'Daily Rebalance',
      icon: TrendingDown,
      color: 'blue',
      description: 'AI adjusts your remaining meals today to hit your target',
      impact: safeRemainingMeals > 0
        ? `Your remaining meal(s) will be reduced by ~${dailyRebalanceAmount} calories each`
        : 'No remaining meals today - consider weekly rebalance',
      adjustmentAmount: dailyRebalanceAmount,
      remainingMeals: safeRemainingMeals,
      pros: ['Hit today\'s target', 'Quick fix', 'Clear immediate action'],
      cons: safeRemainingMeals > 0
        ? ['Smaller portions tonight', 'May feel less satisfied']
        : ['Not available (no meals remaining)']
    },
    weekly: {
      title: 'Weekly Rebalance',
      icon: Calendar,
      color: 'green',
      description: `Spread the ${safeOverage} extra calories across the next ${safeDaysLeft} days`,
      impact: `Subtract ~${weeklyRebalanceAmount} calories per day from upcoming meals`,
      adjustmentAmount: weeklyRebalanceAmount,
      daysRemaining: safeDaysLeft,
      examples: [
        `Tomorrow: Reduce breakfast portion by ${weeklyRebalanceAmount} cal`,
        `Tuesday: Use 1 tsp less oil in cooking (-${Math.round(weeklyRebalanceAmount * 0.9)} cal)`,
        `Wednesday: Smaller dinner carb portion (-${weeklyRebalanceAmount} cal)`
      ],
      pros: ['Barely noticeable changes', 'Stay on weekly budget', 'Tonight\'s meals unchanged'],
      cons: ['Requires planning ahead', 'Needs consistency']
    },
    grace: {
      title: 'Grace Day',
      icon: Heart,
      color: 'purple',
      description: 'Log the calories but make no changes to your plan',
      impact: `You'll be ${safeOverage} calories over today, ${safeOverage} over for the week`,
      weeklyImpact: weeklyImpact,
      pros: ['Enjoy the moment', 'No meal changes', 'Mental flexibility'],
      cons: ['Weekly goal impacted', 'Progress may slow']
    }
  };

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    setSaveError('');

    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      const { error } = await supabase.from('daily_target_adjustments').insert({
        user_id: user?.id,
        adjustment_date: dateStr,
        overage: safeOverage,
        choice: selectedOption,
        daily_reduction: selectedOption === 'daily' ? dailyRebalanceAmount : null,
        weekly_reduction: selectedOption === 'weekly' ? weeklyRebalanceAmount : null,
        days_remaining: selectedOption === 'weekly' ? safeDaysLeft : null,
      });

      if (error) throw error;
      setShowResults(true);
    } catch (err) {
      console.error('Failed to save rebalance choice:', err);
      setSaveError('Something went wrong saving your choice. Please try again.');
    }

    setIsProcessing(false);
  };

  const resetModal = () => {
    setSelectedOption(null);
    setShowResults(false);
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">

        {!showResults ? (
          <>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8" />
                  <h2 className="text-2xl font-bold">Daily Budget Exceeded</h2>
                </div>
                <button
                  onClick={resetModal}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-orange-100">
                {unplannedItem ? (
                  <>You logged <strong>{unplannedItem.name}</strong> ({unplannedItem.calories} cal) which puts you </>
                ) : (
                  <>This meal puts you </>
                )}
                <strong>{safeOverage} calories over</strong> your daily target of {dailyTarget} calories.
              </p>
            </div>

            {/* Options */}
            <div className="p-6">
              <p className="text-slate-700 mb-6 text-center">
                How would you like to handle this? Choose an option below:
              </p>

              <div className="space-y-4">
                {/* Option 1: Daily Rebalance */}
                <OptionCard
                  option="daily"
                  data={rebalanceOptions.daily}
                  selected={selectedOption === 'daily'}
                  onSelect={handleOptionSelect}
                  disabled={safeRemainingMeals === 0}
                />

                {/* Option 2: Weekly Rebalance (RECOMMENDED) */}
                <OptionCard
                  option="weekly"
                  data={rebalanceOptions.weekly}
                  selected={selectedOption === 'weekly'}
                  onSelect={handleOptionSelect}
                  recommended={true}
                />

                {/* Option 3: Grace Day */}
                <OptionCard
                  option="grace"
                  data={rebalanceOptions.grace}
                  selected={selectedOption === 'grace'}
                  onSelect={handleOptionSelect}
                />
              </div>

              {/* Save error */}
              {saveError && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {saveError}
                </div>
              )}

              {/* Confirm Button */}
              {selectedOption && (
                <button
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  className="w-full mt-6 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold py-4 px-6 rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Sparkles className="w-5 h-5 animate-spin" />
                      AI is Rebalancing...
                    </>
                  ) : (
                    <>
                      Confirm {rebalanceOptions[selectedOption].title}
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        ) : (
          /* Results Screen */
          <ResultsScreen
            option={selectedOption}
            data={rebalanceOptions[selectedOption]}
            overage={safeOverage}
            dailyTarget={dailyTarget}
            onClose={resetModal}
          />
        )}
      </div>
    </div>
  );
};

// Option Card Component
const OptionCard = ({ option, data, selected, onSelect, recommended, disabled }) => {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50 border-blue-300',
      selectedBg: 'bg-blue-100 border-blue-500',
      text: 'text-blue-700',
      icon: 'text-blue-600'
    },
    green: {
      bg: 'bg-green-50 border-green-300',
      selectedBg: 'bg-green-100 border-green-500',
      text: 'text-green-700',
      icon: 'text-green-600'
    },
    purple: {
      bg: 'bg-purple-50 border-purple-300',
      selectedBg: 'bg-purple-100 border-purple-500',
      text: 'text-purple-700',
      icon: 'text-purple-600'
    }
  };

  const colors = colorClasses[data.color];
  const Icon = data.icon;

  return (
    <button
      onClick={() => !disabled && onSelect(option)}
      disabled={disabled}
      className={`w-full text-left border-2 rounded-xl p-5 transition-all hover:shadow-md relative ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${selected ? colors.selectedBg : colors.bg} ${
        selected ? colors.selectedBg.split(' ')[1] : colors.bg.split(' ')[1]
      }`}
    >
      {recommended && !disabled && (
        <div className="absolute -top-3 left-4 bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
          ⭐ RECOMMENDED
        </div>
      )}

      {disabled && (
        <div className="absolute -top-3 left-4 bg-slate-400 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
          ⚠️ NOT AVAILABLE
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className={`${colors.bg} p-3 rounded-xl ${selected && !disabled ? 'ring-2 ring-offset-2' : ''}`}>
          <Icon className={`w-6 h-6 ${colors.icon}`} />
        </div>

        <div className="flex-1">
          <h3 className={`text-lg font-bold mb-1 ${colors.text}`}>{data.title}</h3>
          <p className="text-slate-600 text-sm mb-3">{data.description}</p>

          {/* Impact */}
          <div className="bg-white bg-opacity-50 rounded-lg p-3 mb-3">
            <p className="text-sm font-medium text-slate-700 mb-1">Impact:</p>
            <p className="text-sm text-slate-600">{data.impact}</p>
          </div>

          {/* Pros & Cons */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold text-green-700 mb-1">✓ Pros:</p>
              <ul className="text-slate-600 space-y-1">
                {data.pros.map((pro, idx) => (
                  <li key={idx}>• {pro}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-red-700 mb-1">✗ Cons:</p>
              <ul className="text-slate-600 space-y-1">
                {data.cons.map((con, idx) => (
                  <li key={idx}>• {con}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Selection Indicator */}
        {!disabled && (
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
            selected
              ? `bg-${data.color}-500 border-${data.color}-500`
              : 'border-slate-300 bg-white'
          }`}>
            {selected && <div className="w-3 h-3 bg-white rounded-full" />}
          </div>
        )}
      </div>
    </button>
  );
};

// Results Screen Component
const ResultsScreen = ({ option, data, overage, dailyTarget, onClose }) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600'
  };

  return (
    <>
      <div className={`bg-gradient-to-r ${colorClasses[data.color]} text-white p-6 rounded-t-2xl`}>
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-white bg-opacity-20 p-2 rounded-full">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold">Rebalance Complete!</h2>
        </div>
        <p className="text-white text-opacity-90">
          Your plan has been adjusted using <strong>{data.title}</strong>
        </p>
      </div>

      <div className="p-6">
        {option === 'daily' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <h3 className="font-bold text-blue-800 mb-3">🍽️ Today's Adjustment:</h3>

              {data.remainingMeals > 0 ? (
                <>
                  <div className="bg-white rounded-lg p-4 mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-700">Remaining meals today:</span>
                      <span className="font-bold text-slate-800">{data.remainingMeals}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-700">Calories to reduce per meal:</span>
                      <span className="font-bold text-blue-600">~{data.adjustmentAmount} cal</span>
                    </div>
                    <div className="border-t border-slate-200 pt-2 mt-2">
                      <p className="text-sm text-slate-600 mb-2">
                        <strong>Example for your next meal (if 600 cal planned):</strong>
                      </p>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">Original:</span>
                        <span className="line-through text-slate-500">600 cal</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-blue-700 font-medium">Adjusted:</span>
                        <span className="font-bold text-blue-700">{600 - data.adjustmentAmount} cal</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-green-800 mb-1">✓ Smart Reduction Strategy:</p>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• Reduce fats/oils first (1 tsp = ~40 cal)</li>
                      <li>• Then reduce refined carbs (rice, pasta, bread)</li>
                      <li>• Keep protein and vegetables unchanged</li>
                      <li>• Maintain nutritional balance</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="bg-orange-100 border border-orange-300 rounded-lg p-4">
                  <p className="text-orange-800">
                    ⚠️ No remaining meals today. The overage will be logged, but consider weekly rebalance for future days.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">
                <strong>Result:</strong> You'll hit your {dailyTarget} calorie target today by making these small adjustments to your remaining meals.
              </p>
            </div>
          </div>
        )}

        {option === 'weekly' && (
          <div className="space-y-4">
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <h3 className="font-bold text-green-800 mb-3">📅 Your Weekly Adjustment:</h3>
              <div className="bg-white rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-700">Extra calories to spread:</span>
                  <span className="text-2xl font-bold text-orange-600">{overage} cal</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700">Per day ({data.daysRemaining} days remaining):</span>
                  <span className="text-xl font-bold text-green-600">~{data.adjustmentAmount} cal/day</span>
                </div>
              </div>

              <p className="text-sm text-green-700 mb-3 font-medium">Example adjustments coming up:</p>
              <div className="space-y-2">
                {data.examples.map((example, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-2 text-sm text-slate-700">
                    • {example}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">
                <strong>Result:</strong> Today's meals stay unchanged. We'll make tiny cuts to fats and oils
                over the next {data.daysRemaining} days - you'll barely notice, and you'll stay on track for the week!
              </p>
            </div>
          </div>
        )}

        {option === 'grace' && (
          <div className="space-y-4">
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
              <h3 className="font-bold text-purple-800 mb-3">💜 Grace Day Accepted:</h3>
              <div className="bg-white rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-700">Today's total:</span>
                  <span className="text-2xl font-bold text-purple-600">{dailyTarget + overage} cal</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-700">Over by:</span>
                  <span className="text-xl font-bold text-orange-600">+{overage} cal</span>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm text-orange-800 mb-2">
                  <strong>Weekly Impact:</strong>
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Target weekly intake:</span>
                  <span className="font-bold text-slate-800">{data.weeklyImpact.targetWeekly} cal</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">New projected weekly:</span>
                  <span className="font-bold text-orange-600">{data.weeklyImpact.newWeekly} cal</span>
                </div>
                <div className="mt-2 pt-2 border-t border-orange-200">
                  <span className="text-sm text-orange-700">
                    You're {data.weeklyImpact.percentOver}% over your weekly budget
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-600">
                <strong>Result:</strong> No changes to your meals. Your weekly view will show today color-coded
                as an "accepted deviation." Life happens - this is about flexibility and sustainability! 🌟
              </p>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 bg-slate-700 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-all"
        >
          Done - Return to Dashboard
        </button>
      </div>
    </>
  );
};

export default RebalanceModal;
