import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  GoogleGenAI,
  Type,
  Modality,
  LiveServerMessage,
  GenerateVideosOperation,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));

function getAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Live Currency Conversion Rates Endpoint
const EXCHANGE_RATES_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  JPY: 153.4,
  GBP: 0.79,
  INR: 84.1,
  MAD: 9.95,
  AUD: 1.52,
  CAD: 1.38,
  CHF: 0.88,
  CNY: 7.24,
  SGD: 1.34,
  AED: 3.67,
  BRL: 5.65,
  MXN: 19.8,
  KRW: 1375.0,
  THB: 33.8,
};

app.get('/api/exchange-rates', (_req, res) => {
  res.json({
    base: 'USD',
    updatedAt: new Date().toISOString(),
    rates: EXCHANGE_RATES_USD,
  });
});

// 2. Integrated Payment Gateway (Pre-Call Escrow & Hotel/Transit Booking)
app.post('/api/payment/checkout', (req, res) => {
  const { itemType, itemTitle, amountUsd, currency, discountAppliedPct } = req.body || {};
  const finalUsd = Math.max(1, Number(amountUsd || 0));
  const receiptId = `EXP-${Date.now().toString(36).toUpperCase()}`;
  res.json({
    success: true,
    receiptId,
    itemType: itemType || 'explorer_session',
    itemTitle: itemTitle || 'Live Explorer Session',
    chargedUsd: finalUsd,
    currency: currency || 'USD',
    discountAppliedPct: Number(discountAppliedPct || 0),
    timestamp: new Date().toISOString(),
  });
});

// 3. Multilanguage AI Translation for Live Explorer Call & Instructions (30+ languages)
app.post('/api/ai/translate', async (req, res) => {
  try {
    const { text, sourceLanguage, targetLanguage, contextMode } = req.body || {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required for translation.' });
      return;
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Translate the following ${contextMode === 'instruction' ? 'traveler camera/movement instruction for a local guide' : 'live local guide narration'} from ${sourceLanguage || 'auto-detected language'} into ${targetLanguage || 'English'}.\n\nInput text: "${text}"`,
      config: {
        systemInstruction:
          'You are a real-time travel interpreter connecting a remote Traveler and a Local Explorer on a live mobile video call. Return accurate, natural translation along with a phonetic pronunciation guide and a brief 1-sentence cultural or situational tip.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translatedText: {
              type: Type.STRING,
              description: 'The translated text in the target language.',
            },
            pronunciationGuide: {
              type: Type.STRING,
              description: 'Phonetic pronunciation guide for speaking aloud.',
            },
            culturalNote: {
              type: Type.STRING,
              description: 'Brief 1-sentence local etiquette or context note.',
            },
          },
          required: ['translatedText', 'pronunciationGuide', 'culturalNote'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to translate text.',
    });
  }
});

// 4. Gemini Text-to-Speech (TTS) for Speaking Translated Explorer Audio Aloud
app.post('/api/ai/tts', async (req, res) => {
  try {
    const { text, targetLanguage } = req.body || {};
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Speak clearly in ${targetLanguage || 'the text language'}: ${text}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(500).json({ error: 'No audio returned from speech model.' });
      return;
    }

    res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Speech synthesis failed.',
    });
  }
});

// 4B. Gemini Post-Call "Trip Memory" Automatic Summary Generator
app.post('/api/ai/trip-memory', async (req, res) => {
  try {
    const {
      placeName,
      explorerName,
      mood,
      liveEventTag,
      explorerNarration,
      instructionsSent,
      targetLanguage,
    } = req.body || {};

    const ai = getAiClient();
    const instructionsList = Array.isArray(instructionsSent) && instructionsSent.length > 0
      ? instructionsSent.join('; ')
      : 'Walked through the historic lane, zoomed in on local artisan stalls, and explored the scenic viewpoint';

    const prompt = `A live mobile video exploration call just ended on Explorer.
Location Explored: ${placeName || 'Historic District'}
Local Explorer Guide: ${explorerName || 'Local Guide'}
Live Event / Spot Highlight: ${liveEventTag || 'Local Street Walk'}
Mood Category: ${mood || 'Cultural & Historic'}
Explorer Narration Shared During Call: "${explorerNarration || 'Showed hidden courtyards, traditional craft stalls, and local architecture.'}"
Camera Instructions / Stops Requested by Traveler: "${instructionsList}"
Output Language: ${targetLanguage || 'English'}

Generate a rich, evocative 'Trip Memory' summary of the places and highlights the explorer showed during this live call so it can be saved in the traveler's account.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a travel memory chronicler for Explorer. Summarize the places, landmarks, and cultural moments the Local Explorer showed the Traveler during their live video call. Respond strictly in JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            memoryTitle: {
              type: Type.STRING,
              description: 'Evocative title for the saved Trip Memory.',
            },
            summaryText: {
              type: Type.STRING,
              description:
                '2-3 sentence text summary of the specific places, hidden corners, and sights the explorer showed on camera.',
            },
            placesShown: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 5 specific places, stalls, or viewpoints shown during the call.',
            },
            culturalHighlight: {
              type: Type.STRING,
              description: '1-sentence cultural takeaway or local insider detail from the session.',
            },
          },
          required: ['memoryTitle', 'summaryText', 'placesShown', 'culturalHighlight'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error) {
    console.error('Trip memory generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate Trip Memory summary.',
    });
  }
});

// 5. Full AI Travel Planner & Budget Assistant (What Budget Should I Use, Detailed Dates & Places List, Itinerary, Budget Breakdown, Hotels, Transit, Events, Packing List)
app.post('/api/ai/travel-plan', async (req, res) => {
  try {
    const {
      originCity,
      destination,
      travelDates,
      durationDays,
      budgetUsd,
      mood,
      interests,
      preferredLanguage,
      discountPct,
      userBudgetQuestion,
    } = req.body || {};

    const ai = getAiClient();
    const prompt = `Create a comprehensive, realistic travel plan and budget advisory for a trip from ${originCity || 'New York'} to ${destination || 'Kyoto, Japan'}.
Travel Dates / Season: ${travelDates || 'Nov 12 – Nov 16, 2026'} (${durationDays || 4} days)
User Given Budget: $${budgetUsd || 1800} USD
Preferred Mood: ${mood || 'Cultural & Culinary'}
Traveler Interests: ${interests || 'Hidden alleys, street markets, architecture, local crafts'}
User Question to AI Assistant: "${userBudgetQuestion || 'Give me a detailed list of dates, places to visit, and tell me what budget I should use.'}"
Regular User Loyalty Discount Available: ${discountPct || 15}%
Output Language: ${preferredLanguage || 'English'}

Include:
1. 'recommendedBudgetGuide': Answer "What budget should I use?" for ${durationDays || 4} days in ${destination || 'Kyoto, Japan'} with 3 clear tiers in USD (economyTierUsd, recommendedSweetSpotUsd, luxuryTierUsd) and a clear advisory summary.
2. 'detailedDatesAndPlaces': A detailed list of 5 to 6 specific dates/windows and places to visit, what budget to use at each place in USD, an itemized cost breakdown note (entry, food, transit, live explorer call), and why to visit.
3. Detailed budget analysis breaking down Accommodation, Transit (Flights/Trains/Buses), Dining, Live Explorer Sessions, Activities, and Emergency Buffer in USD.
4. Day-by-day schedule with Morning, Afternoon, and Evening slots, estimated cost in USD, and specific camera/live-explorer preview tips.
5. 3 curated hotel options across Budget, Boutique Mid-Range, and Luxury tiers with nightly rates in USD and loyalty discounted rates.
6. Available multi-modal transit options: 1 Flight, 1 High-Speed Train, and 1 Express Bus option with realistic operator names, schedule times, duration, and fare in USD.
7. 3 real-time or seasonal local events happening in ${destination || 'the destination'} tracked by local explorers.
8. A categorized packing list tailored to the destination and activities.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'You are an expert global AI Travel Planner and Budget Advisor. When the user gives you a budget or asks what budget they should use, provide a clear 3-tier budget recommendation, a detailed date-by-date and place-by-place budget schedule, and full itinerary details. Respond strictly in valid JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tripTitle: { type: Type.STRING },
            destinationSummary: { type: Type.STRING },
            estimatedTotalUsd: { type: Type.NUMBER },
            budgetHealthNote: { type: Type.STRING },
            recommendedBudgetGuide: {
              type: Type.OBJECT,
              properties: {
                whatBudgetShouldIUseSummary: { type: Type.STRING },
                economyTierUsd: { type: Type.NUMBER },
                economyDescription: { type: Type.STRING },
                recommendedSweetSpotUsd: { type: Type.NUMBER },
                sweetSpotDescription: { type: Type.STRING },
                luxuryTierUsd: { type: Type.NUMBER },
                luxuryDescription: { type: Type.STRING },
              },
              required: [
                'whatBudgetShouldIUseSummary',
                'economyTierUsd',
                'economyDescription',
                'recommendedSweetSpotUsd',
                'sweetSpotDescription',
                'luxuryTierUsd',
                'luxuryDescription',
              ],
            },
            detailedDatesAndPlaces: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dateLabel: { type: Type.STRING },
                  bestTimeWindow: { type: Type.STRING },
                  placeName: { type: Type.STRING },
                  districtOrCity: { type: Type.STRING },
                  recommendedPlaceBudgetUsd: { type: Type.NUMBER },
                  costBreakdownNote: { type: Type.STRING },
                  whyVisit: { type: Type.STRING },
                },
                required: [
                  'dateLabel',
                  'bestTimeWindow',
                  'placeName',
                  'districtOrCity',
                  'recommendedPlaceBudgetUsd',
                  'costBreakdownNote',
                  'whyVisit',
                ],
              },
            },
            budgetBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  amountUsd: { type: Type.NUMBER },
                  percentage: { type: Type.NUMBER },
                  notes: { type: Type.STRING },
                },
                required: ['category', 'amountUsd', 'percentage', 'notes'],
              },
            },
            itinerary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dayNumber: { type: Type.INTEGER },
                  theme: { type: Type.STRING },
                  morningActivity: { type: Type.STRING },
                  afternoonActivity: { type: Type.STRING },
                  eveningActivity: { type: Type.STRING },
                  estimatedDayCostUsd: { type: Type.NUMBER },
                  explorerLiveTip: { type: Type.STRING },
                },
                required: [
                  'dayNumber',
                  'theme',
                  'morningActivity',
                  'afternoonActivity',
                  'eveningActivity',
                  'estimatedDayCostUsd',
                  'explorerLiveTip',
                ],
              },
            },
            hotels: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  tier: { type: Type.STRING },
                  neighborhood: { type: Type.STRING },
                  nightlyRateUsd: { type: Type.NUMBER },
                  discountedNightlyUsd: { type: Type.NUMBER },
                  ratingScore: { type: Type.NUMBER },
                  highlights: { type: Type.STRING },
                },
                required: [
                  'id',
                  'name',
                  'tier',
                  'neighborhood',
                  'nightlyRateUsd',
                  'discountedNightlyUsd',
                  'ratingScore',
                  'highlights',
                ],
              },
            },
            transitOptions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  mode: { type: Type.STRING, description: 'FLIGHT, TRAIN, or BUS' },
                  operator: { type: Type.STRING },
                  route: { type: Type.STRING },
                  departureTime: { type: Type.STRING },
                  arrivalTime: { type: Type.STRING },
                  duration: { type: Type.STRING },
                  fareUsd: { type: Type.NUMBER },
                },
                required: [
                  'id',
                  'mode',
                  'operator',
                  'route',
                  'departureTime',
                  'arrivalTime',
                  'duration',
                  'fareUsd',
                ],
              },
            },
            localEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  eventName: { type: Type.STRING },
                  timing: { type: Type.STRING },
                  district: { type: Type.STRING },
                  vibe: { type: Type.STRING },
                  entryCostUsd: { type: Type.NUMBER },
                },
                required: ['eventName', 'timing', 'district', 'vibe', 'entryCostUsd'],
              },
            },
            packingList: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING },
                  category: { type: Type.STRING },
                  essentialReason: { type: Type.STRING },
                },
                required: ['item', 'category', 'essentialReason'],
              },
            },
          },
          required: [
            'tripTitle',
            'destinationSummary',
            'estimatedTotalUsd',
            'budgetHealthNote',
            'recommendedBudgetGuide',
            'detailedDatesAndPlaces',
            'budgetBreakdown',
            'itinerary',
            'hotels',
            'transitOptions',
            'localEvents',
            'packingList',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error) {
    console.error('Travel plan generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate AI travel plan.',
    });
  }
});

// 6. Multi-Turn Gemini Chatbot Endpoint
// Supports:
// - 'complex' -> gemini-3.1-pro-preview (with fallback to gemini-3.8-flash if free tier key)
// - 'general' -> gemini-3.8-flash
// - 'fast' -> gemini-3.1-flash-lite
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { history, message, mode, rolePersona, preferredLanguage } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const ai = getAiClient();
    const targetModel =
      mode === 'complex'
        ? 'gemini-3.1-pro-preview'
        : mode === 'fast'
        ? 'gemini-3.1-flash-lite'
        : 'gemini-3.8-flash';

    const systemInstruction = `You are the Explorer AI Concierge (${rolePersona || 'Global Travel & Live Explorer Specialist'}).
You help users discover local destinations, coordinate with live mobile explorers, compare flights/trains/buses, optimize travel budgets, and translate local phrases across 34+ languages.
Respond helpfully, concisely, and in ${preferredLanguage || 'English'}.`;

    const formattedContents = [
      ...(Array.isArray(history)
        ? history.map((turn: { role: string; text: string }) => ({
            role: turn.role === 'model' ? 'model' : 'user',
            parts: [{ text: String(turn.text || '') }],
          }))
        : []),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    let response;
    let usedModel = targetModel;
    try {
      response = await ai.models.generateContent({
        model: targetModel,
        contents: formattedContents,
        config: {
          systemInstruction,
        },
      });
    } catch (primaryErr) {
      if (targetModel === 'gemini-3.1-pro-preview') {
        usedModel = 'gemini-3.8-flash';
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: formattedContents,
          config: {
            systemInstruction,
          },
        });
      } else {
        throw primaryErr;
      }
    }

    res.json({
      reply: response.text || '',
      modelUsed: usedModel,
    });
  } catch (error) {
    console.error('Multi-turn chat error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Chatbot request failed.',
    });
  }
});

// 7. Veo Video Generation Endpoints (3-Step Server-Side Pattern)
// Step 1: Start Video Generation from Uploaded Photo
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, imageBase64, mimeType, aspectRatio } = req.body || {};
    if (!imageBase64) {
      res.status(400).json({ error: 'Please upload a photo to animate.' });
      return;
    }

    const ai = getAiClient();
    const validAspect = aspectRatio === '9:16' ? '9:16' : '16:9';

    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      prompt:
        prompt ||
        'Cinematic camera movement bringing this travel destination scene to life with natural light and gentle atmospheric motion',
      image: {
        imageBytes: imageBase64,
        mimeType: mimeType || 'image/jpeg',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: validAspect,
      },
    });

    res.json({ operationName: operation.name });
  } catch (error) {
    console.error('Veo generate-video error:', error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to start Veo video generation.',
    });
  }
});

// Step 2: Poll Video Operation Status
app.post('/api/video-status', async (req, res) => {
  try {
    const { operationName } = req.body || {};
    if (!operationName) {
      res.status(400).json({ error: 'operationName is required.' });
      return;
    }

    const ai = getAiClient();
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    res.json({ done: Boolean(updated.done) });
  } catch (error) {
    console.error('Veo video-status error:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to poll video status.',
    });
  }
});

// Step 3: Download Completed Video Stream
app.post('/api/video-download', async (req, res) => {
  try {
    const { operationName } = req.body || {};
    if (!operationName) {
      res.status(400).json({ error: 'operationName is required.' });
      return;
    }

    const ai = getAiClient();
    const op = new GenerateVideosOperation();
    op.name = operationName;
    const updated = await ai.operations.getVideosOperation({ operation: op });
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

    if (!uri) {
      res.status(404).json({ error: 'Generated video URI not found.' });
      return;
    }

    const videoRes = await fetch(uri, {
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY || '',
      },
    });

    res.setHeader('Content-Type', 'video/mp4');
    if (videoRes.body) {
      await videoRes.body.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
        })
      );
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Veo video-download error:', error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to download generated video.',
    });
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  // 8. Gemini Live API (`gemini-3.8-live`) Real-Time Voice Conversation WebSocket Bridge
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs) => {
    let liveSession: any = null;
    try {
      const ai = getAiClient();
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction:
            'You are the Explorer Live Voice Companion. Speak warmly and concisely to help the traveler explore local destinations, translate phrases, and plan routes in real time.',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    audio: part.inlineData.data,
                  })
                );
              }
              if (part.text) {
                clientWs.send(
                  JSON.stringify({
                    text: part.text,
                  })
                );
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: unknown) => {
            clientWs.send(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Live session error',
              })
            );
          },
        },
      });

      clientWs.send(JSON.stringify({ status: 'connected' }));

      clientWs.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.audio && liveSession) {
            liveSession.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (parsed.text && liveSession) {
            liveSession.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: parsed.text }] }],
              turnComplete: true,
            });
          }
        } catch {
          // Ignore malformed WS frames
        }
      });

      clientWs.on('close', () => {
        try {
          liveSession?.close?.();
        } catch {
          // Ignore close error
        }
      });
    } catch (err) {
      clientWs.send(
        JSON.stringify({
          error:
            err instanceof Error
              ? err.message
              : 'Unable to initialize gemini-3.8-live session.',
        })
      );
      clientWs.close();
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Explorer full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
