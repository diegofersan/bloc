import type { AIProvider } from '../stores/settingsStore'

const SYSTEM_PROMPT = `You are a productivity expert who applies the "Done Means What" methodology.
Your job: break a task into concrete, binary subtasks that are either DONE or NOT DONE.

Rules:
- Start every subtask with an action verb (Write, Send, Create, Configure, Install, Fix, Test, Deploy, Delete, Update...)
- Each subtask must have a verifiable, observable outcome — someone can look and confirm it is done
- Never generate vague subtasks like "Think about...", "Consider...", "Plan...", "Research..." or "Look into..."
- Keep each subtask concise: max ~12 words
- Adapt the count to complexity: simple tasks = 2-3 subtasks, complex = 4-6, never more than 6
- ALWAYS respond in the SAME LANGUAGE as the user's task
- Return ONLY a JSON array of strings, no other text or markdown`

const USER_PROMPT = (task: string) =>
  `Break this task into done-or-not-done subtasks:\n${task}`

const MAX_SUBTASKS = 6

export async function callOpenAI(
  systemMsg: string,
  userMsg: string,
  apiKey: string,
  model: string
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg }
      ],
      temperature: 0.7
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error?.message ?? `OpenAI API error: ${res.status}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

export async function callAnthropic(
  systemMsg: string,
  userMsg: string,
  apiKey: string,
  model: string
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemMsg,
      messages: [{ role: 'user', content: userMsg }]
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error?.message ?? `Anthropic API error: ${res.status}`)
  }

  const data = await res.json()
  return data.content[0].text
}

export async function callGemini(
  systemMsg: string,
  userMsg: string,
  apiKey: string,
  model: string
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemMsg }] },
        contents: [{ parts: [{ text: userMsg }] }]
      })
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error?.message ?? `Gemini API error: ${res.status}`)
  }

  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

export function parseSubtasks(raw: string): string[] {
  // Strip markdown fences and any surrounding text to find the JSON array
  let cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()

  // Extract JSON array if surrounded by extra text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    cleaned = arrayMatch[0]
  }

  const parsed = JSON.parse(cleaned)

  if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
    throw new Error('Unexpected response format')
  }

  // Filter empty strings
  let subtasks = parsed.filter((s) => s.trim().length > 0)

  // Deduplicate similar subtasks (case-insensitive exact match)
  const seen = new Set<string>()
  subtasks = subtasks.filter((s) => {
    const key = s.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Enforce max subtask limit
  return subtasks.slice(0, MAX_SUBTASKS)
}

const IDEA_TO_ISSUE_PROMPT = `You are a product manager. Transform the user's idea into a structured GitHub issue.
Respond ONLY in JSON: {"title": "concise title", "body": "markdown body"}
- Title: max 80 chars, imperative mood
- Body must follow this exact structure with markdown headers:

## Descrição
One paragraph explaining what the feature does and why it matters.

## Requisitos
- Bullet list of concrete functional requirements

## Benefícios Esperados
- Bullet list of user/product benefits

## Critérios de Aceitação
- Bullet list of verifiable conditions that confirm the feature is done

- ALWAYS respond in the SAME LANGUAGE as the user's idea
- Return ONLY valid JSON, no markdown fences or extra text`

export function parseIssueJson(raw: string): { title: string; body: string } {
  let cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()

  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    cleaned = objMatch[0]
  }

  const parsed = JSON.parse(cleaned)

  if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Unexpected response format: missing title or body')
  }

  return { title: parsed.title, body: parsed.body }
}

export async function ideaToIssue(
  idea: string,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<{ title: string; body: string }> {
  const systemMsg = IDEA_TO_ISSUE_PROMPT
  const userMsg = idea

  try {
    let raw: string
    switch (provider) {
      case 'openai':
        raw = await callOpenAI(systemMsg, userMsg, apiKey, model)
        break
      case 'anthropic':
        raw = await callAnthropic(systemMsg, userMsg, apiKey, model)
        break
      case 'gemini':
        raw = await callGemini(systemMsg, userMsg, apiKey, model)
        break
    }

    return parseIssueJson(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Failed to process idea: ${message}`)
  }
}

export async function expandTask(
  taskText: string,
  provider: AIProvider,
  apiKey: string,
  model: string
): Promise<string[]> {
  const systemMsg = SYSTEM_PROMPT
  const userMsg = USER_PROMPT(taskText)

  try {
    let raw: string
    switch (provider) {
      case 'openai':
        raw = await callOpenAI(systemMsg, userMsg, apiKey, model)
        break
      case 'anthropic':
        raw = await callAnthropic(systemMsg, userMsg, apiKey, model)
        break
      case 'gemini':
        raw = await callGemini(systemMsg, userMsg, apiKey, model)
        break
    }

    return parseSubtasks(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`Failed to expand task: ${message}`)
  }
}
