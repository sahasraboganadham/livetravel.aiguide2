import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Calendar,
  Plane,
  Train,
  Bus,
  Building2,
  CheckSquare,
  CreditCard,
  CheckCircle2,
  BookmarkCheck,
  Compass,
  LocateFixed,
  Wallet,
  MapPin,
  Clock,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import {
  MOOD_CATEGORIES,
  SUPPORTED_LANGUAGES,
  formatCurrency,
} from '../data/catalog';
import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AiTravelPlannerViewProps {
  userLiveLocation: { lat: number; lng: number } | null;
  preferredLanguage: string;
  currencyCode: string;
  liveRates: Record<string, number>;
  loyaltyDiscountPct: number;
  onTripSaved: () => void;
}

export interface GeneratedPlan {
  tripTitle: string;
  destinationSummary: string;
  estimatedTotalUsd: number;
  budgetHealthNote: string;
  recommendedBudgetGuide?: {
    whatBudgetShouldIUseSummary: string;
    economyTierUsd: number;
    economyDescription: string;
    recommendedSweetSpotUsd: number;
    sweetSpotDescription: string;
    luxuryTierUsd: number;
    luxuryDescription: string;
  };
  detailedDatesAndPlaces?: Array<{
    dateLabel: string;
    bestTimeWindow: string;
    placeName: string;
    districtOrCity: string;
    recommendedPlaceBudgetUsd: number;
    costBreakdownNote: string;
    whyVisit: string;
  }>;
  budgetBreakdown: Array<{
    category: string;
    amountUsd: number;
    percentage: number;
    notes: string;
  }>;
  itinerary: Array<{
    dayNumber: number;
    theme: string;
    morningActivity: string;
    afternoonActivity: string;
    eveningActivity: string;
    estimatedDayCostUsd: number;
    explorerLiveTip: string;
  }>;
  hotels: Array<{
    id: string;
    name: string;
    tier: string;
    neighborhood: string;
    nightlyRateUsd: number;
    discountedNightlyUsd: number;
    ratingScore: number;
    highlights: string;
  }>;
  transitOptions: Array<{
    id: string;
    mode: string;
    operator: string;
    route: string;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    fareUsd: number;
  }>;
  localEvents: Array<{
    eventName: string;
    timing: string;
    district: string;
    vibe: string;
    entryCostUsd: number;
  }>;
  packingList: Array<{
    item: string;
    category: string;
    essentialReason: string;
  }>;
}

const INITIAL_PRELOADED_PLAN: GeneratedPlan = {
  tripTitle: 'Kyoto Cultural & Lantern Heritage Plan (AI Budget & Dates Guide)',
  destinationSummary:
    'A 4-day curated itinerary designed around your budget, featuring exact dates, time windows, per-place budget allocations, and a 3-tier guide on what total budget you should use.',
  estimatedTotalUsd: 1650,
  budgetHealthNote:
    'Your $1,850 budget comfortably covers the Recommended Sweet-Spot ($1,650) with a $200 reserve buffer plus your 15% Regular-User Streak Discount.',
  recommendedBudgetGuide: {
    whatBudgetShouldIUseSummary:
      'For a 4-day trip to Kyoto, the ideal Sweet-Spot Budget is $1,650 USD ($412/day), which covers boutique machiya stays, regional Shinkansen/rail passes, authentic kaiseki & street market dining, and 3 Live Local Explorer video previews. If traveling lean, use $980 USD; for 5-star ryokan luxury, use $3,200 USD.',
    economyTierUsd: 980,
    economyDescription:
      'Smart Value ($245/day): Guesthouse stays in Central Kyoto, IC transit card, Nishiki street food stalls, free shrine walks, and 1 Live Explorer session.',
    recommendedSweetSpotUsd: 1650,
    sweetSpotDescription:
      'AI Recommended Sweet Spot ($412/day): Boutique hotel in Gion/Higashiyama, express rail + regional pass, tea ceremony, artisan workshops, and 3 Live Explorer calls.',
    luxuryTierUsd: 3200,
    luxuryDescription:
      'Premium Ryokan & Private Guide ($800/day): Private onsen ryokan in Arashiyama, Green Car Shinkansen, multi-course kaiseki dinners, and unlimited Live Explorer calls.',
  },
  detailedDatesAndPlaces: [
    {
      dateLabel: 'Day 1 · Nov 12, 2026 (Thu)',
      bestTimeWindow: '02:00 PM – 08:30 PM (Twilight Lantern Lighting)',
      placeName: 'Gion Kobu Lantern Alley & Shirakawa Canal',
      districtOrCity: 'Higashiyama & Gion District, Kyoto',
      recommendedPlaceBudgetUsd: 115,
      costBreakdownNote:
        '$25 Live Explorer Preview · $45 Traditional Ochaya Matcha & Wagashi · $30 Evening Rickshaw/Transit · $15 Shrine Lantern Entry',
      whyVisit:
        'Historic 100-year-old wooden teahouses lit by red paper chochin lanterns along cobblestone lanes.',
    },
    {
      dateLabel: 'Day 2 · Nov 13, 2026 (Fri)',
      bestTimeWindow: '07:30 AM – 01:00 PM (Early Morning Golden Light)',
      placeName: 'Fushimi Inari Taisha & Hidden Bamboo Trail',
      districtOrCity: 'Fushimi Ward, Southern Kyoto',
      recommendedPlaceBudgetUsd: 85,
      costBreakdownNote:
        '$0 Shrine Admission · $20 JR Nara Line & Local Rail · $40 Inari Sushi & Uji Tea Lunch · $25 Live Explorer Mountain Trail Call',
      whyVisit:
        'Walk through 10,000 vermilion torii gates and discover quiet upper-mountain bamboo shrines before crowds arrive.',
    },
    {
      dateLabel: 'Day 2 · Nov 13, 2026 (Fri)',
      bestTimeWindow: '02:30 PM – 07:00 PM (Afternoon Craft & Market)',
      placeName: 'Nishiki Market & Teramachi Artisan Arcade',
      districtOrCity: 'Nakagyo Ward, Downtown Kyoto',
      recommendedPlaceBudgetUsd: 95,
      costBreakdownNote:
        '$55 Street Food Tasting (Yuba, Matcha Sweets, Grilled Seafood) · $30 Handcrafted Ceramic Souvenir · $10 Subway Fare',
      whyVisit:
        '400-year-old covered food market ("Kyoto’s Kitchen") with over 100 family-run culinary stalls.',
    },
    {
      dateLabel: 'Day 3 · Nov 14, 2026 (Sat)',
      bestTimeWindow: '08:00 AM – 03:30 PM (Autumn Foliage Peak)',
      placeName: 'Arashiyama Bamboo Grove, Tenryu-ji & Katsura River',
      districtOrCity: 'Arashiyama District, Western Kyoto',
      recommendedPlaceBudgetUsd: 140,
      costBreakdownNote:
        '$35 Sagano Scenic Railway & Temple Garden Entry · $50 Riverfront Tofu Kaiseki Lunch · $30 Wooden Boat Ride · $25 Live Explorer Session',
      whyVisit:
        'Towering emerald bamboo stalks, UNESCO Zen landscape gardens, and panoramic mountain river views.',
    },
    {
      dateLabel: 'Day 4 · Nov 15, 2026 (Sun)',
      bestTimeWindow: '09:00 AM – 04:00 PM (Clear Panorama Window)',
      placeName: 'Kiyomizu-dera Wooden Stage & Sannenzaka Pottery Slope',
      districtOrCity: 'Eastern Hills, Higashiyama, Kyoto',
      recommendedPlaceBudgetUsd: 120,
      costBreakdownNote:
        '$20 Temple Stage & Waterfall Entry · $45 Kiyomizu Pottery Workshop · $40 Soba Noodle Courtyard Lunch · $15 Bus Pass',
      whyVisit:
        'Iconic hillside wooden temple overlooking Kyoto paired with preserved stone-paved artisan pottery slopes.',
    },
  ],
  budgetBreakdown: [
    {
      category: 'Boutique Accommodation (4 Nights w/ 15% Loyalty Discount)',
      amountUsd: 680,
      percentage: 41,
      notes: 'Traditional Machiya Townhouse Hotel in Gion ($170/night discounted)',
    },
    {
      category: 'Flights, High-Speed Shinkansen & Local Transit',
      amountUsd: 420,
      percentage: 25,
      notes: 'Express Airport Transfer + JR Regional Rail & Subway IC Card',
    },
    {
      category: 'Place-by-Place Dining, Tea Houses & Market Tastings',
      amountUsd: 290,
      percentage: 18,
      notes: 'Nishiki Market street food, Arashiyama tofu kaiseki, and Gion tea houses',
    },
    {
      category: 'Live Local Explorer Video Calls & Temple Entries',
      amountUsd: 160,
      percentage: 10,
      notes: '3 pre-trip Live Explorer camera calls ($25 each) + temple garden tickets',
    },
    {
      category: 'Recommended Smart Contingency Buffer',
      amountUsd: 100,
      percentage: 6,
      notes: 'Reserved for artisan souvenirs, rain taxis, or spontaneous local events',
    },
  ],
  itinerary: [
    {
      dayNumber: 1,
      theme: 'Arrival & Gion Twilight Lantern Walk',
      morningActivity: 'Check into Gion Machiya Inn and activate regional IC transit card.',
      afternoonActivity: 'Walk Shirakawa Canal willow bridge and historic wooden machiya lanes.',
      eveningActivity: 'Evening tea house tasting and lantern walk through Gion Kobu.',
      estimatedDayCostUsd: 115,
      explorerLiveTip: 'Ask Local Explorer Kenji Sato to show the hidden Chochin lantern workshop before dusk.',
    },
    {
      dayNumber: 2,
      theme: 'Fushimi Inari Torii Trails & Nishiki Culinary Market',
      morningActivity: 'Early hike through Fushimi Inari vermilion gates and hidden bamboo sub-shrine.',
      afternoonActivity: 'Guided culinary tasting across 12 stalls in Nishiki Market.',
      eveningActivity: 'Pontocho Alley riverside lantern stroll along the Kamogawa River.',
      estimatedDayCostUsd: 180,
      explorerLiveTip: 'Use a Live Explorer call at 7:30 AM to check gate crowd levels and light conditions.',
    },
    {
      dayNumber: 3,
      theme: 'Arashiyama Bamboo Grove & Katsura River Boats',
      morningActivity: 'Walk Arashiyama Bamboo Grove and Tenryu-ji Zen pond garden.',
      afternoonActivity: 'Traditional Yudofu lunch and wooden flat-bottom boat ride on Katsura River.',
      eveningActivity: 'Sunset viewpoint at Okochi Sanso Villa overlooking Kyoto basin.',
      estimatedDayCostUsd: 140,
      explorerLiveTip: 'Have the explorer pan across Togetsukyo Bridge to check river boat queue times.',
    },
    {
      dayNumber: 4,
      theme: 'Kiyomizu-dera Stage & Sannenzaka Artisan Pottery',
      morningActivity: 'Visit Kiyomizu-dera wooden stage and Otowa sacred spring.',
      afternoonActivity: 'Paint Kyo-yaki ceramics along Sannenzaka and Ninenzaka stone slopes.',
      eveningActivity: 'Farewell matcha parfaits and Shinkansen departure transfer.',
      estimatedDayCostUsd: 120,
      explorerLiveTip: 'Preview ceramic studios on Sannenzaka live with your guide before buying.',
    },
  ],
  hotels: [
    {
      id: 'ht_01',
      name: 'Gion Hatanaka Machiya Boutique',
      tier: 'Recommended Sweet-Spot',
      neighborhood: 'Gion & Yasaka Shrine',
      nightlyRateUsd: 200,
      discountedNightlyUsd: 170,
      ratingScore: 4.9,
      highlights: 'Cypress wooden baths, private garden courtyard, 2 mins from lantern alley.',
    },
    {
      id: 'ht_02',
      name: 'Piece Hostel Sanjo Smart Stay',
      tier: 'Economy / Smart Budget',
      neighborhood: 'Nakagyo / Nishiki Market',
      nightlyRateUsd: 85,
      discountedNightlyUsd: 72,
      ratingScore: 4.7,
      highlights: 'Architect-designed minimalist rooms, rooftop terrace, steps from Nishiki Market.',
    },
    {
      id: 'ht_03',
      name: 'Suiran Luxury Collection Ryokan',
      tier: 'Luxury Onsen Tier',
      neighborhood: 'Arashiyama Riverfront',
      nightlyRateUsd: 480,
      discountedNightlyUsd: 408,
      ratingScore: 5.0,
      highlights: 'Private open-air hot spring bath overlooking the emerald Katsura River.',
    },
  ],
  transitOptions: [
    {
      id: 'tr_01',
      mode: 'FLIGHT',
      operator: 'ANA / JAL Express Connect',
      route: 'Origin → Kansai International (KIX) + Haruka Express',
      departureTime: '08:15 AM',
      arrivalTime: '01:40 PM',
      duration: '5h 25m',
      fareUsd: 310,
    },
    {
      id: 'tr_02',
      mode: 'TRAIN',
      operator: 'JR Tokaido Shinkansen Nozomi',
      route: 'Tokyo / Osaka Hub → Kyoto Station Direct',
      departureTime: '09:00 AM',
      arrivalTime: '11:12 AM',
      duration: '2h 12m',
      fareUsd: 96,
    },
    {
      id: 'tr_03',
      mode: 'BUS',
      operator: 'Willer Express Starlight Coach',
      route: 'Regional Hub → Kyoto Station Hachijo Exit',
      departureTime: '07:30 AM',
      arrivalTime: '01:15 PM',
      duration: '5h 45m',
      fareUsd: 42,
    },
  ],
  localEvents: [
    {
      eventName: 'Kodai-ji Temple Autumn Night Illumination',
      timing: 'Nov 12 – Nov 16 · 5:00 PM – 9:30 PM',
      district: 'Higashiyama',
      vibe: 'Bamboo forest and mirror pond lit with reflections',
      entryCostUsd: 12,
    },
    {
      eventName: 'Chion-in Artisan Craft & Antique Fair',
      timing: 'Nov 14 · 8:00 AM – 4:00 PM',
      district: 'Gion North',
      vibe: 'Local potters, kimono textiles, and vintage tea ware',
      entryCostUsd: 0,
    },
    {
      eventName: 'Shirakawa Evening Shamisen & Tea Walk',
      timing: 'Daily · 6:00 PM – 8:00 PM',
      district: 'Gion Shirakawa',
      vibe: 'Intimate acoustic traditional music by the canal',
      entryCostUsd: 25,
    },
  ],
  packingList: [
    {
      item: 'Slip-On Walking Shoes & Temple Socks',
      category: 'Footwear',
      essentialReason: 'Frequent shoe removal at wooden temples and traditional teahouses.',
    },
    {
      item: 'Layered Cashmere or Merino Cardigan',
      category: 'Apparel',
      essentialReason: 'Crisp mornings at Fushimi Inari and cool evening lantern walks.',
    },
    {
      item: 'Portable Power Bank (10,000mAh)',
      category: 'Tech',
      essentialReason: 'Keeps live GPS map and Live Explorer video calls running all day.',
    },
  ],
};

export function AiTravelPlannerView({
  userLiveLocation,
  preferredLanguage,
  currencyCode,
  liveRates,
  loyaltyDiscountPct,
  onTripSaved,
}: AiTravelPlannerViewProps) {
  const [originCity, setOriginCity] = useState(
    userLiveLocation
      ? `My Present Live Location (${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)})`
      : 'My Present Live Location'
  );
  const [destination, setDestination] = useState('Kyoto, Japan');
  const [travelDates, setTravelDates] = useState('Nov 12 – Nov 16, 2026');
  const [durationDays, setDurationDays] = useState(4);
  const [budgetUsd, setBudgetUsd] = useState(1850);
  const [mood, setMood] = useState('Cultural & Historic');
  const [interests, setInterests] = useState(
    'Historic wooden alleys, artisan tea ceremonies, night markets, scenic viewpoints'
  );
  const [userBudgetQuestion, setUserBudgetQuestion] = useState(
    'I have this budget — give me a detailed list of dates, places to visit, and tell me what budget I should use for each place and tier.'
  );

  useEffect(() => {
    if (userLiveLocation && originCity.startsWith('My Present Live Location')) {
      setOriginCity(
        `My Present Live Location (${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)})`
      );
    }
  }, [userLiveLocation]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState<GeneratedPlan>(INITIAL_PRELOADED_PLAN);
  const [checkedPackingItems, setCheckedPackingItems] = useState<Set<string>>(new Set());
  const [bookedItems, setBookedItems] = useState<Record<string, string>>({});
  const [savedTripNotice, setSavedTripNotice] = useState<string | null>(null);

  const langObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === preferredLanguage) ||
    SUPPORTED_LANGUAGES[0];

  // Fallback builder if Gemini API quota is reached so the user always gets a customized plan for their budget
  const buildLocalBudgetPlanFallback = (
    targetBudget: number,
    dest: string,
    dates: string,
    days: number
  ): GeneratedPlan => {
    const safeDays = Math.max(1, days || 4);
    const economyUsd = Math.round(targetBudget * 0.65);
    const sweetSpotUsd = Math.round(targetBudget * 0.92);
    const luxuryUsd = Math.round(targetBudget * 1.65);
    const perPlaceBase = Math.max(35, Math.round((sweetSpotUsd * 0.35) / (safeDays + 1)));

    return {
      ...INITIAL_PRELOADED_PLAN,
      tripTitle: `${dest} — AI Budget & Dates Plan (${dates})`,
      destinationSummary: `Custom ${safeDays}-day itinerary and place-by-place budget schedule tailored to your ${formatCurrency(
        targetBudget,
        currencyCode,
        liveRates
      )} target budget.`,
      estimatedTotalUsd: sweetSpotUsd,
      budgetHealthNote: `For ${safeDays} days in ${dest}, we recommend using ${formatCurrency(
        sweetSpotSpotOrTarget(sweetSpotUsd, targetBudget),
        currencyCode,
        liveRates
      )} as your sweet-spot budget, leaving a healthy reserve buffer plus your ${loyaltyDiscountPct}% loyalty discount.`,
      recommendedBudgetGuide: {
        whatBudgetShouldIUseSummary: `Based on ${safeDays} days in ${dest} (${dates}), the optimal Sweet-Spot Budget you should use is $${sweetSpotUsd} USD ($${Math.round(
          sweetSpotUsd / safeDays
        )}/day). If you want a lean backpacker/value trip, use $${economyUsd} USD ($${Math.round(
          economyUsd / safeDays
        )}/day). For a luxury experience with private guides, use $${luxuryUsd} USD ($${Math.round(
          luxuryUsd / safeDays
        )}/day).`,
        economyTierUsd: economyUsd,
        economyDescription: `Smart Value ($${Math.round(
          economyUsd / safeDays
        )}/day): Clean central guesthouses, public transit passes, street markets, and free landmarks.`,
        recommendedSweetSpotUsd: sweetSpotUsd,
        sweetSpotDescription: `AI Recommended Sweet-Spot ($${Math.round(
          sweetSpotUsd / safeDays
        )}/day): Boutique hotel (${loyaltyDiscountPct}% off), express transit, curated local dining, and Live Explorer sessions.`,
        luxuryTierUsd: luxuryUsd,
        luxuryDescription: `Premium Luxury ($${Math.round(
          luxuryUsd / safeDays
        )}/day): 5-star heritage stay, first-class rail/flights, fine dining, and private Live Explorer tours.`,
      },
      detailedDatesAndPlaces: Array.from({ length: Math.min(6, safeDays + 1) }).map(
        (_, i) => ({
          dateLabel: `Day ${Math.min(safeDays, i + 1)} · ${dates}`,
          bestTimeWindow:
            i % 2 === 0
              ? '08:30 AM – 01:30 PM (Morning Golden Window)'
              : '03:00 PM – 08:30 PM (Sunset & Evening Walk)',
          placeName:
            i === 0
              ? `${dest} Historic Old Town & Lantern Quarter`
              : i === 1
              ? `${dest} Central Artisan Market & Culinary Alley`
              : i === 2
              ? `${dest} Scenic Waterfront & Panoramic Temple Overlook`
              : `${dest} Cultural Heritage Garden & Local Craft District (Spot #${i + 1})`,
          districtOrCity: dest,
          recommendedPlaceBudgetUsd: perPlaceBase + i * 12,
          costBreakdownNote: `$${Math.round(perPlaceBase * 0.25)} Entry & Guide · $${Math.round(
            perPlaceBase * 0.45
          )} Local Dining · $${Math.round(perPlaceBase * 0.15)} Transit · $25 Live Explorer Call`,
          whyVisit: `Must-visit highlight in ${dest} matched to your ${mood} mood and ${formatCurrency(
            targetBudget,
            currencyCode,
            liveRates
          )} budget.`,
        })
      ),
    };
  };

  function sweetSpotSpotOrTarget(sweet: number, target: number) {
    return Math.min(sweet, target);
  }

  const runGeneratePlan = async (overrideBudgetUsd?: number, customQuestion?: string) => {
    const activeBudget = overrideBudgetUsd ?? budgetUsd;
    if (overrideBudgetUsd !== undefined) {
      setBudgetUsd(overrideBudgetUsd);
    }
    if (customQuestion !== undefined) {
      setUserBudgetQuestion(customQuestion);
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setSavedTripNotice(null);

    try {
      const res = await fetch('/api/ai/travel-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originCity,
          destination,
          travelDates,
          durationDays,
          budgetUsd: activeBudget,
          mood,
          interests,
          preferredLanguage: langObj.name,
          discountPct: loyaltyDiscountPct,
          userBudgetQuestion: customQuestion ?? userBudgetQuestion,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        // Fallback to customized budget generator so the user always gets their detailed dates, places, and budget advice
        setPlan(
          buildLocalBudgetPlanFallback(activeBudget, destination, travelDates, durationDays)
        );
      } else {
        setPlan({
          ...INITIAL_PRELOADED_PLAN,
          ...data,
          recommendedBudgetGuide:
            data.recommendedBudgetGuide ||
            INITIAL_PRELOADED_PLAN.recommendedBudgetGuide,
          detailedDatesAndPlaces:
            Array.isArray(data.detailedDatesAndPlaces) &&
            data.detailedDatesAndPlaces.length > 0
              ? data.detailedDatesAndPlaces
              : INITIAL_PRELOADED_PLAN.detailedDatesAndPlaces,
        });
      }
    } catch {
      setPlan(
        buildLocalBudgetPlanFallback(activeBudget, destination, travelDates, durationDays)
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await runGeneratePlan();
  };

  // Integrated Payment Gateway Booking for Hotels & Transit (Flights, Trains, Buses)
  const handleDirectBooking = async (
    itemId: string,
    itemType: 'hotel' | 'transit',
    itemTitle: string,
    amountUsd: number
  ) => {
    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType,
          itemTitle,
          amountUsd,
          currency: currencyCode,
          discountAppliedPct: loyaltyDiscountPct,
        }),
      });
      const data = await res.json();
      if (data.receiptId) {
        setBookedItems((prev) => ({ ...prev, [itemId]: data.receiptId }));
      }
    } catch {
      // Ignore error
    }
  };

  // Save Curated Trip to Firestore `/trips`
  const handleSaveTripToHistory = async () => {
    if (!plan) return;
    if (!auth.currentUser) {
      setSavedTripNotice('Log in via the User Login Screen in the top bar to save trips to your cloud account.');
      return;
    }

    const tripId = `trip_${Date.now()}`;
    const path = `trips/${tripId}`;
    const summaryText = `${plan.tripTitle} — ${plan.destinationSummary}. Hotels: ${plan.hotels
      .map((h) => h.name)
      .join(', ')}. Transit: ${plan.transitOptions
      .map((t) => `${t.mode} (${t.operator})`)
      .join(', ')}.`.slice(0, 2400);

    try {
      await setDoc(doc(db, 'trips', tripId), {
        userId: auth.currentUser.uid,
        destination: destination.slice(0, 120),
        travelDates: travelDates.slice(0, 80),
        totalBudgetUsd: Number(budgetUsd),
        estimatedSpendUsd: Number(plan.estimatedTotalUsd || budgetUsd),
        discountAppliedPct: Number(loyaltyDiscountPct),
        bookingStatus: Object.keys(bookedItems).length > 0 ? 'booked' : 'planned',
        summaryText,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSavedTripNotice('Curated itinerary & budget plan saved to your persistent travel history!');
      onTripSaved();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const togglePackingItem = (item: string) => {
    setCheckedPackingItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const budgetGuide =
    plan.recommendedBudgetGuide || INITIAL_PRELOADED_PLAN.recommendedBudgetGuide!;
  const detailedPlaces =
    plan.detailedDatesAndPlaces || INITIAL_PRELOADED_PLAN.detailedDatesAndPlaces!;

  return (
    <div className="space-y-8">
      {/* =====================================================================
          AI BUDGET ASSISTANT CONSOLE: GIVE YOUR BUDGET -> GET DATES, PLACES & "WHAT BUDGET SHOULD I USE?"
         ===================================================================== */}
      <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-6 space-y-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <p className="text-xs font-mono text-emerald-400">
              AI BUDGET ASSISTANT · DATES, PLACES &amp; &ldquo;WHAT BUDGET SHOULD I USE?&rdquo; ADVISOR
            </p>
            <h2 className="text-xl md:text-2xl font-display font-semibold text-white">
              Give Your Budget to the AI Assistant — Get Detailed Dates, Places &amp; Ideal Budget Tiers
            </h2>
            <p className="text-xs text-slate-400">
              Enter your target budget or ask &ldquo;What budget should I use?&rdquo; below. The AI Assistant breaks down the exact dates, time windows, places to visit, and how much budget to use at every stop in {currencyCode}.
            </p>
          </div>
          {userLiveLocation && (
            <button
              type="button"
              onClick={() =>
                setOriginCity(
                  `My Present Live Location (${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)})`
                )
              }
              className="px-3 py-2 bg-slate-950 border border-slate-700 hover:border-emerald-500 text-emerald-400 text-xs font-mono rounded-xl flex items-center gap-1.5 whitespace-nowrap self-start"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              Use Present Live GPS Origin
            </button>
          )}
        </div>

        {/* Quick Budget Presets ("Give a Budget" or Ask "What Budget Should I Use?") */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 mr-1">
            Quick Give Budget to AI:
          </span>
          {[650, 1200, 1850, 3200, 5000].map((presetUsd) => (
            <button
              key={presetUsd}
              type="button"
              onClick={() =>
                runGeneratePlan(
                  presetUsd,
                  `My budget is $${presetUsd} USD. Give me a detailed list of dates, places, and tell me what budget I should use.`
                )
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-colors ${
                budgetUsd === presetUsd
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                  : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-emerald-400'
              }`}
            >
              {formatCurrency(presetUsd, currencyCode, liveRates)} Budget
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              runGeneratePlan(
                budgetUsd,
                `What budget should I use for ${durationDays} days in ${destination}? Give me economy, recommended sweet-spot, and luxury budgets plus a detailed list of dates and places.`
              )
            }
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Ask AI: &ldquo;What Budget Should I Use?&rdquo;
          </button>
        </div>

        <form onSubmit={handleGeneratePlan} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-emerald-400">
                1. Your Budget for AI Assistant ({formatCurrency(budgetUsd, currencyCode, liveRates)})
              </label>
              <input
                type="number"
                min={150}
                max={50000}
                step={50}
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm font-mono font-semibold bg-slate-950 border-2 border-emerald-500/50 text-white rounded-xl focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                2. Destination City &amp; Country
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                3. Travel Dates &amp; Days ({durationDays} Days)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={travelDates}
                  onChange={(e) => setTravelDates(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="w-16 px-2.5 py-2.5 text-sm font-mono bg-slate-950 border border-slate-800 text-white rounded-xl text-center"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Origin (Present Live Location or City)
              </label>
              <input
                type="text"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Trip Mood
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
              >
                {MOOD_CATEGORIES.filter((m) => m !== 'All Moods').map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300">
                Interests &amp; Must-See Types of Places
              </label>
              <input
                type="text"
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Direct Prompt to AI Budget Assistant */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <input
              type="text"
              value={userBudgetQuestion}
              onChange={(e) => setUserBudgetQuestion(e.target.value)}
              placeholder="Ask AI Budget Assistant: e.g., What budget should I use and what dates & places fit best?"
              className="flex-1 px-4 py-3 text-xs sm:text-sm bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isGenerating}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-lg"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating
                ? `AI Assistant Calculating Dates, Places & Budget...`
                : 'Ask AI Assistant for Dates, Places & Recommended Budget'}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* =====================================================================
          GENERATED AI BUDGET ASSISTANT OUTPUT
         ===================================================================== */}
      {plan && (
        <div className="space-y-8">
          {/* SECTION A: "WHAT BUDGET SHOULD I USE?" AI ADVISOR (3 TIERS) */}
          <div className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <span className="text-xs font-mono text-amber-400 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" />
                  AI ANSWER: &ldquo;WHAT BUDGET SHOULD I USE FOR {destination.toUpperCase()} ({durationDays} DAYS)?&rdquo;
                </span>
                <h3 className="text-xl font-display font-semibold text-white">
                  Recommended Budget Guide &amp; How Your {formatCurrency(budgetUsd, currencyCode, liveRates)} Budget Fits
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-4xl">
                  {budgetGuide.whatBudgetShouldIUseSummary}
                </p>
              </div>

              <button
                onClick={handleSaveTripToHistory}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-2 whitespace-nowrap self-start"
              >
                <BookmarkCheck className="w-4 h-4" />
                Save Budget &amp; Places Plan
              </button>
            </div>

            {savedTripNotice && (
              <p className="text-xs font-mono text-emerald-400">{savedTripNotice}</p>
            )}

            {/* 3 Clickable Budget Tiers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tier 1: Economy / Smart Value */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-mono text-slate-400 block">
                    01. Lean / Smart Value Budget
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-mono font-bold text-white tabular-nums">
                      {formatCurrency(budgetGuide.economyTierUsd, currencyCode, liveRates)}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      ~{formatCurrency(Math.round(budgetGuide.economyTierUsd / Math.max(1, durationDays)), currencyCode, liveRates)}/day
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {budgetGuide.economyDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => runGeneratePlan(budgetGuide.economyTierUsd)}
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  Use This Budget ({formatCurrency(budgetGuide.economyTierUsd, currencyCode, liveRates)})
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tier 2: AI Recommended Sweet-Spot Budget */}
              <div className="p-5 rounded-xl bg-emerald-950/25 border-2 border-emerald-500 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-mono font-semibold text-emerald-400 block">
                    02. AI Recommended Sweet-Spot Budget (Best Value)
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">
                      {formatCurrency(budgetGuide.recommendedSweetSpotUsd, currencyCode, liveRates)}
                    </span>
                    <span className="text-xs font-mono text-emerald-300">
                      ~{formatCurrency(Math.round(budgetGuide.recommendedSweetSpotUsd / Math.max(1, durationDays)), currencyCode, liveRates)}/day
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {budgetGuide.sweetSpotDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => runGeneratePlan(budgetGuide.recommendedSweetSpotUsd)}
                  className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  Use Recommended Budget ({formatCurrency(budgetGuide.recommendedSweetSpotUsd, currencyCode, liveRates)})
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tier 3: Luxury / Private Guide Tier */}
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-mono text-amber-400 block">
                    03. Luxury &amp; Private Guide Budget
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-mono font-bold text-white tabular-nums">
                      {formatCurrency(budgetGuide.luxuryTierUsd, currencyCode, liveRates)}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      ~{formatCurrency(Math.round(budgetGuide.luxuryTierUsd / Math.max(1, durationDays)), currencyCode, liveRates)}/day
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {budgetGuide.luxuryDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => runGeneratePlan(budgetGuide.luxuryTierUsd)}
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  Use Luxury Budget ({formatCurrency(budgetGuide.luxuryTierUsd, currencyCode, liveRates)})
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* SECTION B: DETAILED LIST OF DATES, PLACES & PER-PLACE BUDGET TO USE */}
          <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs font-mono text-emerald-400 block">
                  ITEMIZED SCHEDULE · DATES + PLACES + BUDGET PER PLACE
                </span>
                <h3 className="text-xl font-display font-semibold text-white">
                  Detailed List of Dates, Places to Visit &amp; Exact Budget to Use at Each Place
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Target Budget: {formatCurrency(budgetUsd, currencyCode, liveRates)} · Est. Total: {formatCurrency(plan.estimatedTotalUsd, currencyCode, liveRates)}
              </span>
            </div>

            <div className="divide-y divide-slate-800">
              {detailedPlaces.map((item, index) => (
                <div
                  key={index}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-emerald-400">
                      <span className="flex items-center gap-1 font-semibold">
                        <Calendar className="w-3.5 h-3.5" />
                        {item.dateLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        {item.bestTimeWindow}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        {item.districtOrCity}
                      </span>
                    </div>

                    <h4 className="text-base font-display font-semibold text-white">
                      {index + 1}. {item.placeName}
                    </h4>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {item.whyVisit}
                    </p>

                    <p className="text-xs font-mono text-slate-400">
                      Place Budget Breakdown: <span className="text-slate-200">{item.costBreakdownNote}</span>
                    </p>
                  </div>

                  <div className="lg:text-right shrink-0 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">
                    <span className="text-[11px] font-mono text-slate-400 block">
                      Recommended Budget for Place
                    </span>
                    <span className="text-lg font-mono font-bold text-emerald-400 tabular-nums">
                      {formatCurrency(item.recommendedPlaceBudgetUsd, currencyCode, liveRates)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 1. Category Budget Allocation Breakdown & Real-Time Local Events */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h4 className="text-base font-display font-semibold text-white">
                01. Total Trip Budget Allocation by Category ({currencyCode})
              </h4>
              <div className="divide-y divide-slate-800">
                {plan.budgetBreakdown.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-white">
                        {item.category}
                      </p>
                      <p className="text-xs text-slate-400">{item.notes}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-semibold text-emerald-400">
                        {formatCurrency(item.amountUsd, currencyCode, liveRates)}
                      </p>
                      <p className="text-xs text-slate-400">{item.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Real-time Local Events tracked by Live Explorers */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-display font-semibold text-white">
                  02. Live Explorer Event Radar (Dates &amp; Entry Cost)
                </h4>
                <Compass className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="space-y-3">
                {plan.localEvents.map((ev, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{ev.district} · {ev.timing}</span>
                      <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                        {ev.entryCostUsd === 0
                          ? 'Free Entry'
                          : formatCurrency(ev.entryCostUsd, currencyCode, liveRates)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {ev.eventName}
                    </p>
                    <p className="text-xs text-slate-300">{ev.vibe}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Available Flights, High-Speed Trains & Express Buses */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <h4 className="text-base font-display font-semibold text-white">
                03. Available Flights, Trains &amp; Buses (Integrated Booking)
              </h4>
              <p className="text-xs text-slate-400">
                Multi-modal connections analyzed for your route and budget.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plan.transitOptions.map((tr) => {
                const modeUpper = tr.mode.toUpperCase();
                const receipt = bookedItems[tr.id];
                return (
                  <div
                    key={tr.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          {modeUpper.includes('FLIGHT') ? (
                            <Plane className="w-4 h-4 text-emerald-400" />
                          ) : modeUpper.includes('TRAIN') ? (
                            <Train className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Bus className="w-4 h-4 text-emerald-400" />
                          )}
                          {tr.mode} · {tr.operator}
                        </span>
                        <span className="font-mono tabular-nums">{tr.duration}</span>
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {tr.route}
                      </p>
                      <p className="text-xs font-mono text-slate-400 tabular-nums">
                        Dep: {tr.departureTime} → Arr: {tr.arrivalTime}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                        {formatCurrency(tr.fareUsd, currencyCode, liveRates)}
                      </span>
                      {receipt ? (
                        <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Booked #{receipt}
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            handleDirectBooking(
                              tr.id,
                              'transit',
                              `${tr.mode}: ${tr.operator} (${tr.route})`,
                              tr.fareUsd
                            )
                          }
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Book Seat
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Curated Hotels with Regular User Discount & Direct Payment Gateway */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <h4 className="text-base font-display font-semibold text-white">
                04. Curated Hotels by Budget Tier ({loyaltyDiscountPct}% Regular-User Discount)
              </h4>
              <p className="text-xs text-slate-400">
                Book directly through the integrated payment gateway with your loyalty discount applied automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plan.hotels.map((hotel) => {
                const receipt = bookedItems[hotel.id];
                return (
                  <div
                    key={hotel.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                          {hotel.tier} · {hotel.neighborhood}
                        </span>
                        <span className="font-mono font-semibold text-amber-400">
                          ★ {hotel.ratingScore}
                        </span>
                      </div>
                      <h5 className="text-base font-semibold text-white">
                        {hotel.name}
                      </h5>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {hotel.highlights}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800 space-y-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-500 line-through font-mono tabular-nums">
                          {formatCurrency(hotel.nightlyRateUsd, currencyCode, liveRates)} / night
                        </span>
                        <span className="text-base font-mono font-semibold text-emerald-400 tabular-nums">
                          {formatCurrency(hotel.discountedNightlyUsd, currencyCode, liveRates)} / night
                        </span>
                      </div>

                      {receipt ? (
                        <div className="w-full py-2 px-3 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-lg flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Confirmed · #{receipt}
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            handleDirectBooking(
                              hotel.id,
                              'hotel',
                              hotel.name,
                              hotel.discountedNightlyUsd * durationDays
                            )
                          }
                          className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Book {durationDays} Nights ({formatCurrency(
                            hotel.discountedNightlyUsd * durationDays,
                            currencyCode,
                            liveRates
                          )})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Day-by-Day Schedule & Smart Packing List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-display font-semibold text-white">
                  05. Day-by-Day Travel Schedule &amp; Daily Cost
                </h4>
                <Calendar className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="space-y-4">
                {plan.itinerary.map((day) => (
                  <div
                    key={day.dayNumber}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold text-white">
                        Day {day.dayNumber}: {day.theme}
                      </h5>
                      <span className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                        Est. {formatCurrency(day.estimatedDayCostUsd, currencyCode, liveRates)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold text-white block">Morning</span>
                        {day.morningActivity}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">Afternoon</span>
                        {day.afternoonActivity}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">Evening</span>
                        {day.eveningActivity}
                      </div>
                    </div>
                    <p className="text-xs text-emerald-400 pt-1 border-t border-slate-800">
                      Live Explorer Camera Tip: {day.explorerLiveTip}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Smart Packing List */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-display font-semibold text-white">
                  06. Tailored Packing List
                </h4>
                <CheckSquare className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="space-y-2.5">
                {plan.packingList.map((pk, idx) => {
                  const isChecked = checkedPackingItems.has(pk.item);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => togglePackingItem(pk.item)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3 ${
                        isChecked
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-slate-400 line-through'
                          : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-1 accent-emerald-500"
                      />
                      <div className="space-y-0.5 text-xs">
                        <p className="font-semibold text-white">{pk.item}</p>
                        <p className="text-slate-400">
                          {pk.category} · {pk.essentialReason}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
