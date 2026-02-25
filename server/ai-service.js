import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sysmlToDrawioXml, validateDrawioXml } from './drawio-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR_SCRIPT = join(__dirname, 'extract_docs.py');

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pickProvider(payload, headers) {
  return (
    payload.provider ||
    headers['x-ai-provider'] ||
    headers['x-provider'] ||
    'local'
  ).toString().toLowerCase();
}

function pickModel(payload, headers) {
  return (
    payload.model ||
    headers['x-ai-model'] ||
    headers['x-model'] ||
    'gpt-4.1-mini'
  ).toString();
}

function pickApiKey(payload, headers) {
  return (
    payload.apiKey ||
    headers['x-ai-key'] ||
    headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    ''
  ).toString();
}

function decodeBase64(base64Data) {
  try {
    return Buffer.from(base64Data, 'base64');
  } catch {
    return Buffer.alloc(0);
  }
}

function decodeTextAttachment(attachment) {
  const data = decodeBase64(attachment.base64Data || '');
  return data.toString('utf-8');
}

function runExtractor(mimeType, base64Data) {
  return new Promise((resolve) => {
    const child = spawn('python3', [EXTRACTOR_SCRIPT, mimeType], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout || '{}');
        resolve(parsed.text || '');
      } catch {
        resolve('');
      }
    });

    child.stdin.write(base64Data || '');
    child.stdin.end();
  });
}

async function extractAttachmentContext(attachments = []) {
  const attachmentNotes = [];
  const visionInputs = [];

  for (const attachment of attachments) {
    const mimeType = attachment.mimeType || 'application/octet-stream';
    const name = attachment.name || 'attachment';

    if (mimeType.startsWith('text/') || name.endsWith('.md') || name.endsWith('.txt')) {
      const text = decodeTextAttachment(attachment);
      attachmentNotes.push(`From ${name}:\n${text.slice(0, 4000)}`);
      continue;
    }

    if (mimeType === 'application/pdf' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const text = await runExtractor(mimeType, attachment.base64Data || '');
      if (text.trim()) {
        attachmentNotes.push(`From ${name}:\n${text.slice(0, 5000)}`);
      } else {
        attachmentNotes.push(`From ${name}: [No extractable text was found.]`);
      }
      continue;
    }

    if (mimeType.startsWith('image/')) {
      visionInputs.push({
        name,
        mimeType,
        base64Data: attachment.base64Data || '',
      });
      attachmentNotes.push(`From ${name}: [Image attachment available for vision-capable models.]`);
      continue;
    }

    attachmentNotes.push(`From ${name}: [Unsupported attachment type ${mimeType}.]`);
  }

  return {
    attachmentContext: attachmentNotes.join('\n\n'),
    visionInputs,
  };
}

function extractJsonObject(text) {
  if (!text) return null;

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function extractEntityNames(text) {
  const capWords = Array.from(text.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g)).map((match) => match[1]);
  const fallbackWords = Array.from(text.matchAll(/\b([a-z][a-z0-9_]{3,})\b/gi)).map((match) => {
    const word = match[1];
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return unique(capWords.concat(fallbackWords)).filter((name) => !['System', 'Model', 'Drawio', 'Sysml'].includes(name));
}

function synthesizeSysml(prompt, context) {
  const merged = `${prompt}\n${context}`;
  const names = extractEntityNames(merged);

  const partA = names[0] || 'Controller';
  const partB = names[1] || 'Sensor';
  const partC = names[2] || 'Actuator';
  const requirement = `${(names[3] || 'Core')}Requirement`;
  const verification = `${(names[4] || 'Core')}Verification`;

  const requirementText = prompt.toLowerCase().includes('shall') || prompt.toLowerCase().includes('must')
    ? prompt.split(/[.!?]/).find((line) => /shall|must/i.test(line))?.trim() || 'The system shall satisfy core behavior.'
    : 'The system shall satisfy core behavior.';

  return [
    `package 'Generated System' {`,
    `\tpart def ${partA};`,
    `\tpart def ${partB};`,
    `\tpart def ${partC};`,
    '',
    `\tpart system : ${partA} {`,
    `\t\tpart sensing : ${partB};`,
    `\t\tpart actuation : ${partC};`,
    `\t\tsatisfy ${requirement};`,
    `\t}`,
    '',
    `\tconnect sensing to actuation;`,
    '',
    `\trequirement def ${requirement} {`,
    `\t\tdoc /* ${requirementText.replace(/\*\//g, '')} */`,
    `\t}`,
    '',
    `\tverification def ${verification} {`,
    `\t\tverify ${requirement};`,
    `\t}`,
    `}`,
  ].join('\n');
}

function localEditSysml(prompt, sourceCode) {
  let next = sourceCode || synthesizeSysml(prompt, '');
  const diagnostics = [];

  const renameMatch = prompt.match(/rename\s+([A-Za-z_][\w]*)\s+to\s+([A-Za-z_][\w]*)/i);
  if (renameMatch) {
    const from = renameMatch[1];
    const to = renameMatch[2];
    const regex = new RegExp(`\\b${from}\\b`, 'g');
    next = next.replace(regex, to);
    diagnostics.push(`Renamed ${from} to ${to}.`);
  }

  const addPartMatch = prompt.match(/add\s+(?:a\s+)?part(?:\s+def)?\s+([A-Za-z_][\w]*)/i);
  if (addPartMatch) {
    const partName = addPartMatch[1];
    if (!new RegExp(`\\bpart\\s+def\\s+${partName}\\b`).test(next)) {
      next += `\n\npart def ${partName};`;
      diagnostics.push(`Added part def ${partName}.`);
    }
  }

  const addReqMatch = prompt.match(/add\s+(?:a\s+)?requirement\s+([A-Za-z_][\w]*)/i);
  if (addReqMatch) {
    const reqName = addReqMatch[1];
    if (!new RegExp(`\\brequirement\\s+def\\s+${reqName}\\b`).test(next)) {
      next += `\n\nrequirement def ${reqName};`;
      diagnostics.push(`Added requirement def ${reqName}.`);
    }
  }

  if (diagnostics.length === 0) {
    next += `\n\n// AI note: ${prompt.replace(/\n+/g, ' ').slice(0, 160)}`;
    diagnostics.push('No direct structured edit pattern matched; appended AI note.');
  }

  return { next, diagnostics };
}

async function callOpenAI({ apiKey, model, systemPrompt, userPrompt, visionInputs }) {
  const content = [{ type: 'input_text', text: userPrompt }];
  for (const image of visionInputs) {
    if (!image.base64Data) continue;
    content.push({
      type: 'input_image',
      image_url: `data:${image.mimeType};base64,${image.base64Data}`,
    });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const data = await response.json();
  return data.output_text || '';
}

async function callAnthropic({ apiKey, model, systemPrompt, userPrompt }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}).`);
  }

  const data = await response.json();
  const first = Array.isArray(data.content) ? data.content[0] : null;
  return first?.text || '';
}

async function callGoogle({ apiKey, model, systemPrompt, userPrompt }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Google request failed (${response.status}).`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  return candidate?.content?.parts?.[0]?.text || '';
}

function normalizeResponse(rawText, fallbackPrompt, contextText) {
  const parsed = extractJsonObject(rawText) || {};
  const sysml = (parsed.sysml || '').toString().trim();
  const notes = Array.isArray(parsed.notes) ? parsed.notes.map((item) => String(item)) : [];

  if (!sysml) {
    return {
      sysml: synthesizeSysml(fallbackPrompt, contextText),
      notes: notes.concat(['Provider response was not valid JSON; used local synthesis.']),
    };
  }

  return { sysml, notes };
}

async function modelWithProvider({ provider, apiKey, model, systemPrompt, userPrompt, visionInputs }) {
  if (provider === 'openai') {
    return callOpenAI({ apiKey, model, systemPrompt, userPrompt, visionInputs });
  }
  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model, systemPrompt, userPrompt });
  }
  if (provider === 'google') {
    return callGoogle({ apiKey, model, systemPrompt, userPrompt });
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

function buildSystemPrompt() {
  return [
    'You generate SysML v2 and Draw.io-aligned model data.',
    'Return JSON only: {"sysml":"...","notes":["..."]}.',
    'Prioritize structural SysML subset: Package, PartDef, PartUsage, PortDef, PortUsage, ConnectionUsage, RequirementDef, RequirementUsage, satisfy, verify.',
    'Ensure SysML is syntactically simple and parseable.',
  ].join(' ');
}

export async function generateModel(payload, headers) {
  const provider = pickProvider(payload, headers);
  const model = pickModel(payload, headers);
  const apiKey = pickApiKey(payload, headers);
  const prompt = String(payload.prompt || '').trim();

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const { attachmentContext, visionInputs } = await extractAttachmentContext(attachments);

  const userPrompt = [
    `User request:\n${prompt}`,
    attachmentContext ? `\nAttachment context:\n${attachmentContext}` : '',
  ].join('\n');

  const diagnostics = [];
  let sysml = '';
  let notes = [];

  if (provider !== 'local' && apiKey) {
    try {
      const rawText = await modelWithProvider({
        provider,
        apiKey,
        model,
        systemPrompt: buildSystemPrompt(),
        userPrompt,
        visionInputs,
      });
      const normalized = normalizeResponse(rawText, prompt, attachmentContext);
      sysml = normalized.sysml;
      notes = normalized.notes;
      diagnostics.push(`Generated with provider ${provider}:${model}.`);
    } catch (error) {
      diagnostics.push(`Provider call failed: ${error.message}`);
    }
  }

  if (!sysml) {
    sysml = synthesizeSysml(prompt, attachmentContext);
    diagnostics.push('Used local heuristic generation.');
  }

  const drawioXml = sysmlToDrawioXml(sysml);
  return {
    sysml,
    drawioXml,
    diagnostics,
    notes,
  };
}

export async function editModel(payload, headers) {
  const provider = pickProvider(payload, headers);
  const model = pickModel(payload, headers);
  const apiKey = pickApiKey(payload, headers);
  const prompt = String(payload.prompt || '').trim();
  const sourceCode = String(payload.sourceCode || '');

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const { attachmentContext, visionInputs } = await extractAttachmentContext(attachments);

  const diagnostics = [];
  let sysml = '';

  if (provider !== 'local' && apiKey) {
    try {
      const userPrompt = [
        `Current SysML:\n${sourceCode}`,
        `Edit request:\n${prompt}`,
        attachmentContext ? `\nAttachment context:\n${attachmentContext}` : '',
      ].join('\n\n');

      const rawText = await modelWithProvider({
        provider,
        apiKey,
        model,
        systemPrompt: buildSystemPrompt(),
        userPrompt,
        visionInputs,
      });

      const normalized = normalizeResponse(rawText, prompt, attachmentContext);
      sysml = normalized.sysml;
      diagnostics.push(`Edited with provider ${provider}:${model}.`);
    } catch (error) {
      diagnostics.push(`Provider edit failed: ${error.message}`);
    }
  }

  if (!sysml) {
    const localEdit = localEditSysml(prompt, sourceCode);
    sysml = localEdit.next;
    diagnostics.push(...localEdit.diagnostics);
  }

  const drawioXml = sysmlToDrawioXml(sysml);

  return {
    sysml,
    drawioXml,
    appliedPatches: [],
    reviewPatches: [],
    diagnostics,
  };
}

export async function validateDrawio(payload) {
  const drawioXml = String(payload.drawioXml || '');
  const validation = validateDrawioXml(drawioXml);

  return {
    valid: validation.valid,
    diagnostics: validation.diagnostics,
  };
}
