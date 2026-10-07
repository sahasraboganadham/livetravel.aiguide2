import React, { useState } from 'react';
import {
  Compass,
  Radio,
  LogIn,
  Globe,
  ShieldCheck,
  Camera,
  BellRing,
  Sparkles,
  LocateFixed,
  Award,
  CreditCard,
  Smartphone,
  ArrowRightLeft,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
} from '../data/catalog';
import { PWAInstallButton } from './PWAInstallButton';

interface SeparateLoginPortalGatewayProps {
  activePortal: 'user' | 'explorer';
  onSwitchPortal: (portal: 'user' | 'explorer') => void;
  travelerEmail: string;
  onChangeTravelerEmail: (val: string) => void;
  explorerEmail: string;
  onChangeExplorerEmail: (val: string) => void;
  preferredLanguage: string;
  onChangeLanguage: (code: string) => void;
  currencyCode: string;
  onChangeCurrency: (code: string) => void;
  userLiveLocation: { lat: number; lng: number } | null;
  liveLocationStatus: string;
  onRequestLiveLocation: () => void;
  onLoginUserPortal: (useGoogle: boolean, displayName: string) => void;
  onLoginExplorerPortal: (useGoogle: boolean, displayName: string) => void;
  onOpenMobileAppWorkspace?: () => void;
}

export function SeparateLoginPortalGateway({
  activePortal,
  onSwitchPortal,
  travelerEmail,
  onChangeTravelerEmail,
  explorerEmail,
  onChangeExplorerEmail,
  preferredLanguage,
  onChangeLanguage,
  currencyCode,
  onChangeCurrency,
  userLiveLocation,
  liveLocationStatus,
  onRequestLiveLocation,
  onLoginUserPortal,
  onLoginExplorerPortal,
  onOpenMobileAppWorkspace,
}: SeparateLoginPortalGatewayProps) {
  const [userDisplayName, setUserDisplayName] = useState('Alex Rivera');
  const [userPassword, setUserPassword] = useState('••••••••••••');

  const [explorerDisplayName, setExplorerDisplayName] = useState('Kenji Sato');
  const [explorerPassword, setExplorerPassword] = useState('••••••••••••');
  const [explorerCitySpot, setExplorerCitySpot] = useState('Gion Lantern Alley, Kyoto');

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLoginUserPortal(false, userDisplayName.trim() || 'Traveler');
  };

  const handleExplorerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLoginExplorerPortal(false, explorerDisplayName.trim() || 'Local Explorer');
  };

  return (
    <div className="py-4 space-y-6">
      {/* Top Separate Portal Switcher Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-mono text-emerald-400">
            {activePortal === 'user'
              ? 'USER PORTAL DOMAIN · https://user.explorer.live/login'
              : 'EXPLORER PORTAL DOMAIN · https://explorer.explorer.live/login'}
          </p>
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-white">
            {activePortal === 'user'
              ? 'User / Traveler Dedicated Login Portal'
              : 'Local Explorer Guide Dedicated Login Portal'}
          </h1>
          <p className="text-xs text-slate-400">
            {activePortal === 'user'
              ? 'This portal is exclusively for Travelers. Need to broadcast as a Local Guide? Switch to the separate Explorer Portal.'
              : 'This portal is exclusively for Local Explorer Guides. Looking to explore places as a Traveler? Switch to the separate User Portal.'}
          </p>
        </div>

        {/* Dedicated 2-Portal Switcher */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => onSwitchPortal('user')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activePortal === 'user'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              User Portal
            </button>
            <button
              type="button"
              onClick={() => onSwitchPortal('explorer')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activePortal === 'explorer'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Explorer Portal
            </button>
          </div>

          {onOpenMobileAppWorkspace && (
            <button
              type="button"
              onClick={onOpenMobileAppWorkspace}
              className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              {activePortal === 'user' ? 'User Mobile View' : 'Explorer Mobile View'}
            </button>
          )}
          <PWAInstallButton />
        </div>
      </div>

      {/* SINGLE DEDICATED PORTAL CARD (Strictly Separated: Either User OR Explorer) */}
      <div className="max-w-xl mx-auto">
        {activePortal === 'user' ? (
          /* =====================================================================
             PORTAL 1 ONLY: USER / TRAVELER LOGIN PORTAL (`https://user.explorer.live`)
             ===================================================================== */
          <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-mono font-semibold text-emerald-400">
                  USER PORTAL · https://user.explorer.live
                </span>
              </div>
              <button
                type="button"
                onClick={onRequestLiveLocation}
                className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                {userLiveLocation
                  ? `${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)}`
                  : 'Lock Live GPS'}
              </button>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-display font-semibold text-white">
                Sign In to User Portal
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter your Traveler account to explore around your present live GPS location, claim $300.00 Login Credits, unlock your 15% Streak Score discount, and save Gemini Trip Memories.
              </p>
            </div>

            {/* User Perks */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span className="font-mono font-semibold text-white block">$300 Credits</span>
                <span className="text-[11px] text-slate-400">Traveler Wallet</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <Award className="w-4 h-4 text-emerald-400" />
                <span className="font-mono font-semibold text-white block">150 Streak</span>
                <span className="text-[11px] text-slate-400">15% Regular Off</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="font-mono font-semibold text-white block">Cam Privacy</span>
                <span className="text-[11px] text-slate-400">User Cam On/Off</span>
              </div>
            </div>

            <form onSubmit={handleUserSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    User Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={userDisplayName}
                    onChange={(e) => setUserDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    User Portal Email
                  </label>
                  <input
                    type="email"
                    required
                    value={travelerEmail}
                    onChange={(e) => onChangeTravelerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Your Language (34)
                  </label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => onChangeLanguage(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Currency (16)
                  </label>
                  <select
                    value={currencyCode}
                    onChange={(e) => onChangeCurrency(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs font-mono bg-slate-950 border border-slate-800 text-emerald-400 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol.trim()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4" />
                  Log In to User Portal (user.explorer.live)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onLoginUserPortal(true, userDisplayName.trim() || 'Traveler')
                  }
                  className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Sign In to User Portal with Google OAuth
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Are you a Local Explorer Guide?</span>
              <button
                type="button"
                onClick={() => onSwitchPortal('explorer')}
                className="text-amber-400 hover:underline font-semibold flex items-center gap-1"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Switch to Explorer Login Portal
              </button>
            </div>
          </div>
        ) : (
          /* =====================================================================
             PORTAL 2 ONLY: LOCAL EXPLORER GUIDE LOGIN PORTAL (`https://explorer.explorer.live`)
             ===================================================================== */
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-mono font-semibold text-amber-400">
                  EXPLORER PORTAL · https://explorer.explorer.live
                </span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Verified Local Guide Domain
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-display font-semibold text-white">
                Sign In to Local Explorer Portal
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dedicated portal exclusively for Local Explorers. Receive incoming Call Notifications with mobile vibration alerts, stream your mobile camera, and translate your live speech across 34 languages.
              </p>
            </div>

            {/* Explorer Capabilities */}
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <BellRing className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-semibold text-white block">Call Alerts</span>
                <span className="text-[11px] text-slate-400">Vibrate &amp; Accept</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <Camera className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-semibold text-white block">Mobile Cam</span>
                <span className="text-[11px] text-slate-400">Live Video Stream</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
                <Globe className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-semibold text-white block">34 Languages</span>
                <span className="text-[11px] text-slate-400">Live Subtitles</span>
              </div>
            </div>

            <form onSubmit={handleExplorerSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Explorer Guide Name
                  </label>
                  <input
                    type="text"
                    required
                    value={explorerDisplayName}
                    onChange={(e) => setExplorerDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Explorer Portal Email
                  </label>
                  <input
                    type="email"
                    required
                    value={explorerEmail}
                    onChange={(e) => onChangeExplorerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Guide Access Key
                  </label>
                  <input
                    type="password"
                    required
                    value={explorerPassword}
                    onChange={(e) => setExplorerPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Spoken Local Language
                  </label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => onChangeLanguage(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-amber-500"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Broadcast Spot
                  </label>
                  <input
                    type="text"
                    value={explorerCitySpot}
                    onChange={(e) => setExplorerCitySpot(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4" />
                  Log In to Explorer Portal (explorer.explorer.live)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onLoginExplorerPortal(
                      true,
                      explorerDisplayName.trim() || 'Local Explorer'
                    )
                  }
                  className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  Sign In as Verified Guide with Google OAuth
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Looking for the Traveler Portal?</span>
              <button
                type="button"
                onClick={() => onSwitchPortal('user')}
                className="text-emerald-400 hover:underline font-semibold flex items-center gap-1"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Switch to User Login Portal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
