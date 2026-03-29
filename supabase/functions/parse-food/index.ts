import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userInput } = await req.json()

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY secret not configured on this function')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a precise nutrition assistant. Convert natural language food descriptions into structured nutritional data.

ACCURACY RULES:
- For well-known branded or chain restaurant items (McDonald's, Starbucks, Chipotle, etc.), use their OFFICIAL published nutritional values exactly. Example: 1 McDonald's Big Mac = 550 cal, 25g protein, 46g carbs, 30g fat.
- When a quantity is specified (e.g. "4 Big Macs"), multiply the single-item values by that quantity. 4 Big Macs = 4 × 550 = 2200 cal total.
- For generic foods, use USDA standard values.
- Do NOT guess or round aggressively. Use the real numbers.
- Portion size rules: "handful" = 30g nuts, "small" = 0.75x standard, "medium" = standard, "large" = 1.5x standard.
- Return ONLY valid JSON, no markdown, no backticks, no explanation.

Response format:
{
  "items": [
    {
      "name": "Food name (include quantity in name, e.g. '4x Big Mac')",
      "quantity": 4,
      "unit": "each",
      "grams": 680,
      "calories": 2200,
      "protein": 100,
      "carbs": 184,
      "fat": 120,
      "fiber": 8.0,
      "sugar": 20.0
    }
  ],
  "total_calories": 2200
}`,
          },
          {
            role: 'user',
            content: userInput,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${errText}`)
    }

    const completion = await response.json()
    const result = JSON.parse(completion.choices[0].message.content)

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Failed to parse food entry' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
