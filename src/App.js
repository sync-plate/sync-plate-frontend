import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import Auth from './components/Auth';
import ProfileSetup from './components/ProfileSetup';
import HouseholdSetup from './components/HouseholdSetup';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" - that's okay, user just needs to create profile
        console.error('Error fetching profile:', error);
      }

      setUserProfile(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleProfileComplete() {
    // Refresh user profile after creation
    if (session) {
      fetchUserProfile(session.user.id);
    }
  }

  function handleHouseholdComplete() {
    // Refresh user profile after household setup
    if (session) {
      fetchUserProfile(session.user.id);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login/signup
  if (!session) {
    return <Auth />;
  }

  // Authenticated but no profile - show profile setup
  if (!userProfile) {
    return <ProfileSetup userId={session.user.id} onComplete={handleProfileComplete} />;
  }

  // Has profile but no household - show household setup
  if (!userProfile.household_id) {
    return <HouseholdSetup userId={session.user.id} onComplete={handleHouseholdComplete} />;
  }

  // Everything is set up - show dashboard
  return <Dashboard currentUserId={session.user.id} />;
}

export default App;