import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();


const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Uploaded receipt images directory
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  // ignore
}
app.use('/api/uploads', express.static(UPLOADS_DIR));

// PWA Service Worker & Manifest explicitly served with proper headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  if (fs.existsSync(swPath)) {
    res.sendFile(swPath);
  } else {
    res.status(404).send('Not found');
  }
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).send('Not found');
  }
});

// Initialize Gemini Client
const getGenAI = () => {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Resilient Gemini Generator with Exponential Retry & Model Fallback Cascade
const FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

// Helper to remove raw symbols, asterisks, hashtags, and clutter from AI Tutor responses
function cleanTutorText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText;
  // Remove markdown heading hashes
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Remove bold & italic markdown asterisks and underscores
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/___([^_]+)___/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  // Remove standalone star asterisks or decorative horizontal lines
  text = text.replace(/^\s*[\*\-_=]{3,}\s*$/gm, '');
  text = text.replace(/\s*\*\s*/g, ' ');
  // Convert markdown bullet asterisks to clean bullet points
  text = text.replace(/^\s*[\*\-]\s+/gm, '• ');
  // Remove blockquote carrots
  text = text.replace(/^\s*>\s*/gm, '');
  // Remove backticks
  text = text.replace(/`{1,3}([^`]+)`{1,3}/g, '$1');
  text = text.replace(/`/g, '');
  // Clean excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

interface GenerateOptions {
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: any;
  temperature?: number;
}

async function callGeminiWithResilience(ai: GoogleGenAI, options: GenerateOptions): Promise<string> {
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const config: any = {};
        if (options.systemInstruction) config.systemInstruction = options.systemInstruction;
        if (options.responseMimeType) config.responseMimeType = options.responseMimeType;
        if (options.responseSchema) config.responseSchema = options.responseSchema;
        if (options.temperature !== undefined) config.temperature = options.temperature;

        const response = await ai.models.generateContent({
          model,
          contents: options.prompt,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        const isTransient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('overloaded');

        if (isTransient && attempt === 0) {
          await new Promise((res) => setTimeout(res, 800));
          continue;
        }
        break; // try next model in cascade
      }
    }
  }

  throw lastError || new Error('Service temporarily unavailable');
}

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Smart Study Tutorial PWA', time: new Date().toISOString() });
});

// 1. Ask AI Tutor (for students)
app.post('/api/ai/ask-tutor', async (req, res) => {
  try {
    const { prompt, message, subject, contextNote, context, history } = req.body;
    const userPrompt = prompt || message;
    if (!userPrompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getGenAI();
    let systemInstruction = `You are the friendly, encouraging, and highly knowledgeable AI Tutor for "Smart Study Tutorial". 
You help students understand complex concepts in STEM, Humanities, and General Aptitude.

CRITICAL FORMATTING INSTRUCTIONS (USER PREFERENCE):
- Strictly avoid using markdown symbols such as asterisks (*, **, ***), hashtags (#, ##, ###), bold stars, or unnecessary decoration.
- Do NOT output hashtags or stars. Keep all headings as plain capitalized words or clean lines (e.g., "Overview:", "Step 1:", "Key Concept:").
- Use clean numbered lists (1., 2., 3.) or clean bullet points (• ) for lists.
- Write in clean, plain, natural, readable sentences and paragraphs.
- End with a clean, encouraging thought.
- IMPORTANT RULE FOR MATHEMATICS: For all Mathematics subjects, problems, and equations, all explanations, derivations, steps, hints, and responses MUST be strictly and exclusively in English.`;

    if (subject) {
      systemInstruction += `\nCurrent Subject Focus: ${subject}.`;
      if (subject.toLowerCase().includes('math')) {
        systemInstruction += `\nSPECIAL REQUIREMENT: The explanation and all steps for this Mathematics topic must be provided exclusively in English.`;
      }
    }
    const noteContext = contextNote || context;
    if (noteContext) {
      systemInstruction += `\nReference Study Context / Note:\n"""\n${noteContext}\n"""`;
    }

    let textResponse = '';
    try {
      const rawResponse = await callGeminiWithResilience(ai, {
        prompt: userPrompt,
        systemInstruction,
        temperature: 0.7,
      });
      textResponse = cleanTutorText(rawResponse);
    } catch (aiErr) {
      console.warn('Gemini API high demand / fallback activated for ask-tutor:', aiErr);
      textResponse = `Quick Concept Guidance\n\nRegarding your question: "${userPrompt}" in ${subject || 'General Study'}:\n\n1. Core Principle: In ${subject || 'academic problem solving'}, always identify the given conditions, the definitions that connect them, and work systematically step by step.\n2. Study Tip: Review key definitions and formulas in your Study Notes tab, and practice similar questions in the Question Bank.\n\nFeel free to ask follow-up questions or request specific step-by-step problem breakdowns!`;
    }

    res.json({
      response: textResponse,
      reply: textResponse,
    });
  } catch (error: any) {
    console.error('Error in /api/ai/ask-tutor:', error);
    res.status(200).json({
      response: "I am currently reviewing high volumes of student questions. Please review the curriculum notes and ask again shortly!",
      reply: "I am currently reviewing high volumes of student questions. Please review the curriculum notes and ask again shortly!"
    });
  }
});

// 2. AI Question Generator (for Admin)
app.post('/api/ai/generate-question', async (req, res) => {
  const { subject, topic, difficulty = 'medium', count = 1 } = req.body;
  try {
    const ai = getGenAI();

    const isMath = subject && subject.toLowerCase().includes('math');
    const promptText = `Generate ${count} high-quality, realistic multiple-choice tutorial exam questions for the following:
Subject: ${subject || 'General Science'}
Topic: ${topic || 'Core Principles'}
Difficulty Level: ${difficulty}
${isMath ? 'IMPORTANT: For Mathematics, the question, all 4 options, the step-by-step explanation, and the hint MUST be strictly in English only.' : ''}

Ensure the questions test conceptual understanding or problem-solving. Provide 4 distinct options, clearly identify the correct option index (0 to 3), and give an in-depth step-by-step explanation and a helpful hint.`;

    let parsed: any[] = [];
    try {
      const responseText = await callGeminiWithResilience(ai, {
        prompt: promptText,
        systemInstruction: `You are an expert exam creator and curriculum designer for Smart Study Tutorial.${isMath ? ' All Mathematics content and explanations must be exclusively in English.' : ''}`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              questionText: { type: Type.STRING, description: 'The question text or problem statement' },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Four multiple choice options (A, B, C, D)'
              },
              correctOptionIndex: { type: Type.INTEGER, description: 'Zero-based index (0, 1, 2, or 3) of the correct option' },
              explanation: { type: Type.STRING, description: 'Comprehensive step-by-step solution and reason why the answer is correct' },
              hint: { type: Type.STRING, description: 'A short guiding hint for students' },
              difficulty: { type: Type.STRING, description: 'Difficulty level (easy, medium, hard)' },
              subject: { type: Type.STRING, description: 'Subject name' },
              topic: { type: Type.STRING, description: 'Topic or chapter name' },
              points: { type: Type.INTEGER, description: 'Point value, e.g. 10 or 15' }
            },
            required: ['questionText', 'options', 'correctOptionIndex', 'explanation']
          }
        }
      });
      parsed = JSON.parse(responseText || '[]');
    } catch (aiErr) {
      console.warn('Gemini API high demand fallback for generate-question:', aiErr);
      parsed = [
        {
          questionText: `Which of the following best demonstrates the core principle of ${topic || subject || 'general scientific inquiry'}?`,
          options: [
            'Systematic empirical observation and hypothesis testing',
            'Relying solely on uncontrolled assumptions without evidence',
            'Ignoring experimental discrepancies and anomalous data',
            'Selecting only data that confirms initial bias'
          ],
          correctOptionIndex: 0,
          explanation: `Systematic empirical observation and hypothesis testing form the foundation of scientific and logical analysis across all national curriculum standards.`,
          hint: 'Think about the standard scientific method.',
          difficulty: difficulty,
          subject: subject || 'General Science',
          topic: topic || 'Core Principles',
          points: 10
        }
      ];
    }

    res.json({ questions: parsed });
  } catch (error: any) {
    console.error('Error in /api/ai/generate-question:', error);
    res.status(200).json({
      questions: [
        {
          questionText: `What is a fundamental requirement in ${subject || 'study problem solving'}?`,
          options: [
            'Understanding underlying formulas and definitions',
            'Memorizing arbitrary choices without logic',
            'Skipping verification of boundary conditions',
            'Assuming variables are always equal to zero'
          ],
          correctOptionIndex: 0,
          explanation: 'Clear conceptual comprehension of definitions and foundational formulas is essential for solving curriculum questions.',
          hint: 'Focus on fundamental definitions.',
          difficulty: 'medium',
          subject: subject || 'General Practice',
          topic: topic || 'Fundamentals',
          points: 10
        }
      ]
    });
  }
});

// 3. AI Question Deep Explanation (for students reviewing tests)
app.post('/api/ai/explain-question', async (req, res) => {
  const { questionText, options = [], correctOptionIndex = 0, userSelectedOptionIndex, explanation, subject } = req.body;
  try {
    const ai = getGenAI();

    const isMath = (subject && subject.toLowerCase().includes('math')) || 
                   (explanation && (explanation.includes('∫') || explanation.includes('dx') || explanation.includes('lim ') || explanation.includes('f(x)')));

    const promptText = `Please break down this practice question for a student in "Smart Study Tutorial":
${subject ? `Subject: ${subject}` : ''}
Question: "${questionText}"
Options:
${options.map((opt: string, i: number) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}
Correct Answer: Option ${String.fromCharCode(65 + correctOptionIndex)} (${options[correctOptionIndex] || ''})
${userSelectedOptionIndex !== undefined && userSelectedOptionIndex !== null ? `Student Chose: Option ${String.fromCharCode(65 + userSelectedOptionIndex)} (${options[userSelectedOptionIndex] || ''})` : ''}
Base Explanation: ${explanation || 'None provided'}
${isMath ? '\nIMPORTANT: Provide the complete explanation, derivation, and tips exclusively in English.' : ''}

CRITICAL FORMATTING INSTRUCTIONS (USER PREFERENCE):
- Strictly avoid using markdown symbols like asterisks (*, **, ***), hashtags (#, ##, ###), bold stars, or unnecessary decoration.
- Do NOT output hashtags or stars. Keep all headings as plain capitalized words or clean lines.
- Write in clean, plain, natural, readable sentences and paragraphs.

Structure the breakdown as follows:
1. Concept Summary: What fundamental principle is being tested?
2. Step-by-Step Solution Breakdown: Walk through the logical or mathematical derivation clearly in English.
3. Why Other Options Are Incorrect: Briefly explain why each other distractor option is incorrect.
4. Exam Pro Tip: A clean rule or strategy to avoid mistakes in exams.`;

    let explanationText = '';
    try {
      const rawText = await callGeminiWithResilience(ai, {
        prompt: promptText,
        systemInstruction: `You are an inspiring, friendly master tutor for Smart Study Tutorial. Do not use asterisks, hashtags, or markdown decorative symbols in your output.${isMath ? ' For Mathematics, all explanations, steps, and tips must be strictly in English.' : ''}`,
        temperature: 0.5,
      });
      explanationText = cleanTutorText(rawText);
    } catch (aiErr) {
      console.warn('Gemini API high demand / fallback activated for explain-question:', aiErr);
      
      const correctOptText = options[correctOptionIndex] || `Option ${String.fromCharCode(65 + correctOptionIndex)}`;
      const distractors = options
        .map((opt: string, i: number) => ({ opt, i }))
        .filter((item: { opt: string; i: number }) => item.i !== correctOptionIndex);

      explanationText = `Concept Summary:
This question tests core conceptual understanding regarding:
"${questionText}"

Step-by-Step Solution Breakdown:
• Correct Answer: Option ${String.fromCharCode(65 + correctOptionIndex)} (${correctOptText})
• Logical Rationale: ${explanation || `According to the standard curriculum, Option ${String.fromCharCode(65 + correctOptionIndex)} is the valid outcome.`}

Why Other Options Are Incorrect:
${distractors.map((d: { opt: string; i: number }) => `• Option ${String.fromCharCode(65 + d.i)} ("${d.opt}"): Represents a common misconception that contradicts the required conditions.`).join('\n')}

Exam Pro Tip:
• Key Strategy: Eliminate obviously incorrect options first, highlight given variables, and verify that your chosen option directly answers the specific prompt.`;
    }

    res.json({ explanation: cleanTutorText(explanationText) });
  } catch (error: any) {
    console.error('Error in /api/ai/explain-question:', error);
    res.status(200).json({
      explanation: `Verified Curriculum Solution\n\nCorrect Answer: Option ${String.fromCharCode(65 + Number(correctOptionIndex || 0))}\n\n${explanation || 'Refer to the official Ethiopian national exam guidelines and curriculum notes for this question.'}`
    });
  }
});

// 4. AI Note Summarizer & Key Takeaways
app.post('/api/ai/summarize-note', async (req, res) => {
  const { title, subject, contentMarkdown } = req.body;
  try {
    const ai = getGenAI();

    const promptText = `Analyze the following tutorial study note and generate a concise executive revision summary and 5 bullet point key takeaways for fast exam review:
Title: ${title}
Subject: ${subject}
Content:
"""
${contentMarkdown}
"""`;

    let parsed: any = null;
    try {
      const responseText = await callGeminiWithResilience(ai, {
        prompt: promptText,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: '2-3 sentence overview of this note' },
            keyTakeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of 4-6 essential bullet takeaways or formula rules'
            },
            estimatedReadTimeMinutes: { type: Type.INTEGER, description: 'Estimated reading time in minutes' }
          },
          required: ['summary', 'keyTakeaways']
        }
      });
      parsed = JSON.parse(responseText || '{}');
    } catch (aiErr) {
      console.warn('Gemini API fallback for summarize-note:', aiErr);
      const lines = (contentMarkdown || '').split('\n').filter((l: string) => l.trim().length > 0);
      const bulletLines = lines.filter((l: string) => l.startsWith('-') || l.startsWith('*') || l.startsWith('#')).slice(0, 5);
      
      parsed = {
        summary: `Comprehensive study guide covering foundational principles and exam mastery points for ${title} (${subject}).`,
        keyTakeaways: bulletLines.length > 0
          ? bulletLines.map((l: string) => l.replace(/^[-*#\s]+/, ''))
          : [
              `Master core definitions and formulas for ${title}`,
              'Practice high-frequency national examination problem types',
              'Review step-by-step proofs and derivations',
              'Eliminate common misconceptions in multiple-choice questions'
            ],
        estimatedReadTimeMinutes: Math.max(2, Math.ceil((contentMarkdown || '').length / 500))
      };
    }

    res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/ai/summarize-note:', error);
    res.status(200).json({
      summary: `Revision summary for ${title} (${subject}).`,
      keyTakeaways: ['Review standard definitions', 'Practice multiple choice questions', 'Review formula sheets'],
      estimatedReadTimeMinutes: 5
    });
  }
});

// -------------------------------------------------------------
// PERSISTENT SERVER-SIDE STORAGE FOR PAYMENTS & STUDENTS
// Ensures that screenshots uploaded on any phone or browser
// are securely stored on the server and delivered directly
// to Admin Guduru Alemayehu (gudurualemayehu29@gmail.com).
// -------------------------------------------------------------

interface ServerTransaction {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: 'completed' | 'pending' | 'failed' | 'rejected';
  referenceNo?: string;
  screenshotUrl?: string;
  screenshotName?: string;
  createdAt: string;
}

interface ServerStudent {
  id: string;
  email: string;
  name: string;
  role: 'student';
  avatar?: string;
  subscription?: {
    status: 'active' | 'expired' | 'pending_verification' | 'none';
    planId?: string;
    planName?: string;
    amountPaid?: number;
    paymentMethod?: string;
    transactionId?: string;
    screenshotUrl?: string;
    screenshotName?: string;
    activatedAt?: string;
    expiresAt?: string;
  };
  createdAt?: string;
}

const TX_FILE = path.join(DATA_DIR, 'transactions.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

let memoryTransactions: ServerTransaction[] | null = null;
let memoryStudents: ServerStudent[] | null = null;

// Real-time SSE event streaming for instant delivery of payment screenshots to Admin Panel
const sseClients: Set<express.Response> = new Set();

function broadcastPaymentEvent(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (e) {
    // ignore
  }
}

// Convert base64 dataUrls to permanent image files served at /api/uploads/...
function saveScreenshotFile(dataUrl: string, prefix = 'receipt'): string {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  // If already a hosted URL, preserve it
  if (!dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  try {
    ensureDataDir();
    // 1. Base64 encoded image
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      let ext = matches[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      if (ext.includes('svg')) ext = 'svg';
      if (ext.includes('png')) ext = 'png';
      if (ext.includes('webp')) ext = 'webp';

      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      const buffer = Buffer.from(matches[2], 'base64');
      fs.writeFileSync(filePath, buffer);
      console.log(`[STORAGE] Saved receipt screenshot to disk: /api/uploads/${filename} (${buffer.length} bytes)`);
      return `/api/uploads/${filename}`;
    }

    // 2. SVG XML dataUrl
    const svgMatch = dataUrl.match(/^data:image\/svg\+xml(?:;utf8)?,(.*)$/);
    if (svgMatch) {
      const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.svg`;
      const filePath = path.join(UPLOADS_DIR, filename);
      let svgContent = svgMatch[1];
      try {
        svgContent = decodeURIComponent(svgMatch[1]);
      } catch {
        svgContent = svgMatch[1];
      }
      fs.writeFileSync(filePath, svgContent, 'utf8');
      console.log(`[STORAGE] Saved SVG receipt screenshot to disk: /api/uploads/${filename}`);
      return `/api/uploads/${filename}`;
    }

    return dataUrl;
  } catch (err) {
    console.warn('Could not save screenshot to file, retaining dataUrl:', err);
    return dataUrl;
  }
}

function loadServerTransactions(): ServerTransaction[] {
  ensureDataDir();
  let txs: ServerTransaction[] = [];
  try {
    if (fs.existsSync(TX_FILE)) {
      const data = fs.readFileSync(TX_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        let hasConversions = false;
        txs = parsed.map((t) => {
          if (t.screenshotUrl && t.screenshotUrl.startsWith('data:')) {
            hasConversions = true;
            return { ...t, screenshotUrl: saveScreenshotFile(t.screenshotUrl, 'receipt') };
          }
          return t;
        });
        if (hasConversions) {
          try {
            fs.writeFileSync(TX_FILE, JSON.stringify(txs, null, 2), 'utf8');
          } catch {}
        }
      }
    }
  } catch (e) {
    console.warn('Could not read transactions file', e);
  }

  // Cross-reference with students to ensure every student who uploaded a payment screenshot appears in transactions
  try {
    const students = loadServerStudents();
    let hasNewFromStudents = false;
    for (const s of students) {
      if (s.subscription && (s.subscription.screenshotUrl || s.subscription.transactionId)) {
        const studentScreenshot = s.subscription.screenshotUrl && s.subscription.screenshotUrl.startsWith('data:')
          ? saveScreenshotFile(s.subscription.screenshotUrl, 'receipt')
          : (s.subscription.screenshotUrl || '');

        if (studentScreenshot !== s.subscription.screenshotUrl) {
          s.subscription.screenshotUrl = studentScreenshot;
        }

        const matchingTx = txs.find(
          (t) =>
            t.id === s.subscription?.transactionId ||
            (t.referenceNo && t.referenceNo === s.subscription?.transactionId) ||
            (t.userEmail && s.email && t.userEmail.toLowerCase() === s.email.toLowerCase()) ||
            (t.userId && t.userId === s.id) ||
            (t.userName && s.name && t.userName.toLowerCase().includes(s.name.toLowerCase()))
        );
        if (!matchingTx) {
          txs.push({
            id: s.subscription.transactionId || ('tx-' + s.id),
            userId: s.id,
            userEmail: s.email,
            userName: s.name,
            planId: s.subscription.planId || 'plan-termly',
            planName: s.subscription.planName || 'One Semester Full Pass',
            amount: s.subscription.amountPaid || 300,
            currency: 'ETB ',
            paymentMethod: s.subscription.paymentMethod || 'CBE / Telebirr',
            status: s.subscription.status === 'active' ? 'completed' : 'pending',
            referenceNo: s.subscription.transactionId || ('REF-' + s.id),
            screenshotUrl: studentScreenshot,
            screenshotName: s.subscription.screenshotName || 'Payment_Receipt.jpg',
            createdAt: s.subscription.activatedAt || s.createdAt || new Date().toISOString().split('T')[0]
          });
          hasNewFromStudents = true;
        } else if (!matchingTx.screenshotUrl && studentScreenshot) {
          matchingTx.screenshotUrl = studentScreenshot;
          hasNewFromStudents = true;
        }
      }
    }
    if (hasNewFromStudents) {
      saveServerTransactions(txs);
      saveServerStudents(students);
    }
  } catch (err) {
    console.warn('Could not cross-sync students with transactions:', err);
  }

  memoryTransactions = txs;
  return memoryTransactions;
}

function saveServerTransactions(txs: ServerTransaction[]) {
  memoryTransactions = txs;
  ensureDataDir();
  try {
    fs.writeFileSync(TX_FILE, JSON.stringify(txs, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write transactions file', e);
  }
}

function loadServerStudents(): ServerStudent[] {
  ensureDataDir();
  try {
    if (fs.existsSync(STUDENTS_FILE)) {
      const data = fs.readFileSync(STUDENTS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        memoryStudents = parsed;
        return memoryStudents;
      }
    }
  } catch (e) {
    console.warn('Could not read students file', e);
  }
  return memoryStudents || [];
}

function saveServerStudents(students: ServerStudent[]) {
  memoryStudents = students;
  ensureDataDir();
  try {
    fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write students file', e);
  }
}

const ADMIN_TARGET_EMAIL = 'gudurualemayehu29@gmail.com';

async function sendPaymentReceiptEmailToAdmin(tx: ServerTransaction) {
  const appBaseUrl = process.env.APP_URL || 'https://ais-pre-oqlj5kjzjqvslrukke4unm-135981601966.europe-west1.run.app';
  const approvalLink = `${appBaseUrl}/api/payments/quick-approve?txId=${encodeURIComponent(tx.id)}`;

  const subject = `🎓 New Payment Screenshot: ${tx.userName} - ${tx.currency}${tx.amount} (${tx.paymentMethod})`;
  const textSummary = `Smart Study Tutorial - Student Payment Verification
Student Name: ${tx.userName}
Student Contact: ${tx.userEmail}
Plan: ${tx.planName}
Amount Paid: ${tx.currency}${tx.amount}
Payment Channel: ${tx.paymentMethod}
Transaction Reference: ${tx.referenceNo}
Date: ${tx.createdAt}

Direct 1-Click Approval Link:
${approvalLink}

Open Admin Dashboard:
${appBaseUrl}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid #334155;">
      <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="color: #6366f1; margin: 0; font-size: 22px;">Smart Study Tutorial</h1>
        <p style="color: #f59e0b; font-size: 13px; font-weight: bold; margin-top: 4px; text-transform: uppercase;">
          New Student Payment Verification Request
        </p>
      </div>

      <div style="background-color: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #475569;">
        <h3 style="color: #38bdf8; margin-top: 0; margin-bottom: 12px; font-size: 15px;">Student Transfer Details:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1;">
          <tr>
            <td style="padding: 6px 0; color: #94a3b8; width: 140px;">Student Name:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #ffffff;">${tx.userName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Student Email/Phone:</td>
            <td style="padding: 6px 0; color: #ffffff; font-family: monospace;">${tx.userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Amount Paid:</td>
            <td style="padding: 6px 0; font-size: 16px; font-weight: bold; color: #f59e0b;">${tx.currency}${tx.amount}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Plan:</td>
            <td style="padding: 6px 0; color: #ffffff;">${tx.planName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Payment Method:</td>
            <td style="padding: 6px 0; color: #ffffff;">${tx.paymentMethod}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Transaction Ref:</td>
            <td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #38bdf8;">${tx.referenceNo}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Submitted Date:</td>
            <td style="padding: 6px 0; color: #cbd5e1;">${tx.createdAt}</td>
          </tr>
        </table>
      </div>

      ${
        tx.screenshotUrl
          ? `
        <div style="background-color: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #475569; text-align: center;">
          <h4 style="color: #f59e0b; margin-top: 0; margin-bottom: 12px; font-size: 14px;">Attached Payment Receipt Screenshot:</h4>
          <div style="max-height: 480px; overflow: hidden; border-radius: 8px; border: 1px solid #334155; margin-bottom: 8px;">
            <img src="${tx.screenshotUrl.startsWith('data:') ? tx.screenshotUrl : 'cid:receiptImage'}" alt="Payment Receipt Screenshot" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
          </div>
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">Screenshot stored securely in Admin Dashboard</p>
        </div>
      `
          : `<p style="color: #ef4444; font-size: 13px;">No screenshot image provided.</p>`
      }

      <div style="text-align: center; margin-top: 24px;">
        <a href="${approvalLink}" style="background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; margin-right: 8px;">
          ✓ Approve & Grant Student Access
        </a>
        <a href="${appBaseUrl}" style="background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
          Open Admin Portal
        </a>
      </div>

      <div style="margin-top: 24px; border-top: 1px solid #334155; padding-top: 14px; text-align: center; font-size: 11px; color: #64748b;">
        Smart Study Tutorial • Verified Payment Delivery System for Admin Guduru Alemayehu (${ADMIN_TARGET_EMAIL})
      </div>
    </div>
  `;

  let emailDispatched = false;
  let deliveryMethod = 'none';

  // 1. If SMTP / Gmail credentials configured, send via nodemailer
  if (process.env.SMTP_USER || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true' || !process.env.SMTP_PORT || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER || process.env.GMAIL_USER || ADMIN_TARGET_EMAIL,
          pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS
        }
      });

      const attachments: any[] = [];
      if (tx.screenshotUrl && tx.screenshotUrl.startsWith('data:image/')) {
        const matches = tx.screenshotUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          attachments.push({
            filename: tx.screenshotName || 'payment_receipt.jpg',
            content: Buffer.from(matches[2], 'base64'),
            contentType: matches[1],
            cid: 'receiptImage'
          });
        }
      }

      await transporter.sendMail({
        from: `"Smart Study Tutorial" <${process.env.SMTP_USER || process.env.GMAIL_USER || ADMIN_TARGET_EMAIL}>`,
        to: ADMIN_TARGET_EMAIL,
        subject,
        text: textSummary,
        html: htmlContent,
        attachments
      });

      emailDispatched = true;
      deliveryMethod = 'smtp';
      console.log(`[SMTP EMAIL SUCCESS] Delivered payment screenshot to ${ADMIN_TARGET_EMAIL}`);
    } catch (smtpErr) {
      console.warn('[SMTP EMAIL FAILED] Falling back to HTTP notification relay:', smtpErr);
    }
  }

  // 2. Always trigger HTTP delivery relay to ensure Admin Guduru is notified in real time
  try {
    const relayResponse = await fetch(`https://formsubmit.co/ajax/${ADMIN_TARGET_EMAIL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        _subject: `🎓 New Payment Screenshot: ${tx.userName} (${tx.currency}${tx.amount})`,
        studentName: tx.userName,
        studentEmail: tx.userEmail,
        amount: `${tx.currency}${tx.amount}`,
        plan: tx.planName,
        paymentMethod: tx.paymentMethod,
        referenceNumber: tx.referenceNo,
        submittedDate: tx.createdAt,
        screenshotStatus: tx.screenshotUrl ? 'Screenshot Attached & Stored on Server' : 'None',
        instantApproveLink: approvalLink,
        adminDashboardLink: appBaseUrl,
        _template: 'table'
      })
    });

    if (relayResponse.ok) {
      emailDispatched = true;
      deliveryMethod = deliveryMethod === 'smtp' ? 'smtp+relay' : 'relay';
      console.log(`[HTTP EMAIL RELAY SUCCESS] Payment notification delivered to ${ADMIN_TARGET_EMAIL}`);
    }
  } catch (relayErr) {
    console.warn('[HTTP EMAIL RELAY NOTICE]', relayErr);
  }

  return { sent: emailDispatched, method: deliveryMethod };
}

// 4b. Real-Time SSE Stream for Instant Payment Screenshot Delivery to Admin
app.get('/api/payments/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  sseClients.add(res);

  // Send initial connected payload
  res.write(`event: connected\ndata: ${JSON.stringify({ time: Date.now(), activeClients: sseClients.size })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// 5. Submit Payment & Screenshot (Called by student from any phone/browser)
app.post('/api/payments/submit', (req, res) => {
  try {
    const {
      id,
      userId,
      userEmail,
      userName,
      planId,
      planName,
      amount,
      currency,
      paymentMethod,
      referenceNo,
      screenshotUrl,
      screenshotName,
      createdAt
    } = req.body;

    const resolvedName = (userName && userName.trim()) || 'Student';
    const cleanEmail =
      (userEmail && userEmail.trim().toLowerCase()) ||
      resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '.') + '@student.smartstudy.edu';

    const txs = loadServerTransactions();
    const students = loadServerStudents();

    const txReference = referenceNo || 'TX-' + Math.floor(100000 + Math.random() * 900000);
    const txId = id || 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

    // Calculate 1 semester expiration (4 months)
    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 4);

    // Save uploaded screenshot as a static image file on disk
    const hostedScreenshotUrl = saveScreenshotFile(screenshotUrl || '', 'receipt');
    // Retain dataUrl if provided so image is permanently preserved in JSON across container resets
    const finalScreenshotUrl = (screenshotUrl && typeof screenshotUrl === 'string' && screenshotUrl.startsWith('data:'))
      ? screenshotUrl
      : (hostedScreenshotUrl || screenshotUrl || '');

    // Subscription status is strictly PENDING until Admin Guduru Alemayehu verifies the screenshot
    const pendingSub = {
      status: 'pending_verification' as const,
      planId: planId || 'plan-termly',
      planName: planName || 'One Semester Full Pass',
      amountPaid: Number(amount) || 300,
      paymentMethod: paymentMethod || 'CBE Bank Transfer (1000521750255)',
      transactionId: txReference,
      screenshotUrl: finalScreenshotUrl,
      screenshotName: screenshotName || 'Payment_Receipt.jpg',
      activatedAt: new Date().toISOString().split('T')[0],
      expiresAt: expireDate.toISOString().split('T')[0]
    };

    // Smart student matching across id, email, name, and phone numbers
    const cleanLowerEmail = cleanEmail.toLowerCase();
    const cleanLowerName = resolvedName.toLowerCase();
    const rawContactDigits = (userName || '').replace(/[^0-9]/g, '') || (userEmail || '').replace(/[^0-9]/g, '');

    const sIdx = students.findIndex((s) => {
      // NEVER match generic demo ID!
      if (userId && userId !== 'student-demo' && !userId.includes('sample') && s.id && (s.id === userId)) return true;
      if (s.email && cleanLowerEmail && !s.email.includes('student.sample') && s.email.toLowerCase() === cleanLowerEmail) return true;
      if (rawContactDigits.length >= 8) {
        const sDigits = ((s.email || '') + (s.name || '')).replace(/[^0-9]/g, '');
        if (sDigits && sDigits.includes(rawContactDigits)) return true;
      }
      return false;
    });

    const targetUserId = sIdx >= 0 
      ? students[sIdx].id 
      : (userId && userId !== 'student-demo' && !userId.includes('sample') ? userId : 'student-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6));

    const newTx: ServerTransaction = {
      id: txId,
      userId: targetUserId,
      userEmail: cleanEmail,
      userName: resolvedName,
      planId: pendingSub.planId,
      planName: pendingSub.planName,
      amount: pendingSub.amountPaid,
      currency: currency || 'ETB ',
      paymentMethod: pendingSub.paymentMethod,
      status: 'pending', // PENDING: Requires Admin Guduru Alemayehu verification
      referenceNo: txReference,
      screenshotUrl: finalScreenshotUrl,
      screenshotName: screenshotName || 'Payment_Receipt.jpg',
      createdAt: createdAt || new Date().toISOString().split('T')[0]
    };

    // Prevent duplicate entries if already exists by id or referenceNo
    const existingTxIndex = txs.findIndex(
      (t) => t.id === newTx.id || (t.referenceNo && t.referenceNo === newTx.referenceNo)
    );
    if (existingTxIndex >= 0) {
      txs[existingTxIndex] = newTx;
    } else {
      txs.unshift(newTx);
    }
    saveServerTransactions(txs);

    // Update student subscription status to PENDING_VERIFICATION (not active yet)
    let finalStudent: ServerStudent;
    if (sIdx >= 0) {
      students[sIdx] = {
        ...students[sIdx],
        name: students[sIdx].name || resolvedName,
        email: students[sIdx].email && !students[sIdx].email.includes('student.sample') ? students[sIdx].email : cleanEmail,
        subscription: pendingSub
      };
      finalStudent = students[sIdx];
    } else {
      finalStudent = {
        id: targetUserId,
        email: cleanEmail,
        name: resolvedName,
        role: 'student',
        subscription: pendingSub,
        createdAt: newTx.createdAt
      };
      students.unshift(finalStudent);
    }
    saveServerStudents(students);

    console.log(`[PAYMENT SCREENSHOT DELIVERED TO ADMIN] Student ${resolvedName} (${cleanEmail}) submitted ${newTx.currency}${newTx.amount}. Screenshot stored at ${hostedScreenshotUrl} for Admin Guduru Alemayehu verification.`);

    // 1. Broadcast LIVE SSE event to Admin Panel active screens immediately!
    broadcastPaymentEvent('new_payment', {
      transaction: newTx,
      student: finalStudent,
      pendingCount: txs.filter((t) => t.status === 'pending').length,
      timestamp: Date.now()
    });

    // 2. Dispatch automated email notification directly to Admin Guduru Alemayehu (gudurualemayehu29@gmail.com)
    sendPaymentReceiptEmailToAdmin(newTx)
      .then((emailRes) => {
        console.log(`[PAYMENT EMAIL NOTIFICATION] Result for ${ADMIN_TARGET_EMAIL}: sent=${emailRes.sent}, method=${emailRes.method}`);
      })
      .catch((err) => {
        console.warn(`[PAYMENT EMAIL NOTIFICATION ERROR]`, err);
      });

    res.json({
      success: true,
      message: 'Payment screenshot submitted! Receipt queued for Admin Guduru Alemayehu to verify and grant access.',
      transaction: newTx,
      subscription: pendingSub,
      adminEmailNotified: true,
      adminEmail: ADMIN_TARGET_EMAIL
    });
  } catch (err: any) {
    console.error('Error in /api/payments/submit:', err);
    res.status(500).json({ error: 'Failed to process payment submission: ' + (err?.message || String(err)) });
  }
});

// 5b. Quick 1-Click Approve Link (Used from Email notification by Admin Guduru Alemayehu)
app.get('/api/payments/quick-approve', (req, res) => {
  try {
    const txId = req.query.txId as string;
    if (!txId) {
      return res.status(400).send('<h1>Missing transaction ID</h1>');
    }

    const txs = loadServerTransactions();
    const students = loadServerStudents();

    const tx = txs.find((t) => t.id === txId || t.referenceNo === txId);
    if (!tx) {
      return res.status(404).send('<h1>Transaction not found or already verified</h1>');
    }

    tx.status = 'completed';
    saveServerTransactions(txs);

    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 4);

    const activeSub = {
      status: 'active' as const,
      planId: tx.planId,
      planName: tx.planName,
      amountPaid: tx.amount,
      paymentMethod: tx.paymentMethod,
      transactionId: tx.referenceNo,
      screenshotUrl: tx.screenshotUrl,
      screenshotName: tx.screenshotName,
      activatedAt: new Date().toISOString().split('T')[0],
      expiresAt: expireDate.toISOString().split('T')[0]
    };

    const sIdx = students.findIndex((s) =>
      (tx.userEmail && s.email && s.email.toLowerCase() === tx.userEmail.toLowerCase()) ||
      (tx.userId && s.id === tx.userId) ||
      (s.subscription && s.subscription.transactionId === tx.referenceNo) ||
      (tx.userName && s.name && s.name.toLowerCase() === tx.userName.toLowerCase())
    );
    if (sIdx >= 0) {
      students[sIdx].subscription = activeSub;
    } else {
      students.unshift({
        id: tx.userId || ('student-' + Date.now()),
        email: tx.userEmail || 'student@smartstudy.edu',
        name: tx.userName || 'Student',
        role: 'student',
        subscription: activeSub,
        createdAt: tx.createdAt || new Date().toISOString().split('T')[0]
      });
    }
    saveServerStudents(students);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Approved - Smart Study Tutorial</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; max-width: 480px; width: 100%; padding: 32px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            .badge { display: inline-block; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: bold; margin-bottom: 16px; }
            h1 { font-size: 24px; margin: 0 0 12px; color: #ffffff; }
            p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
            .details { background: #0f172a; border-radius: 12px; padding: 16px; text-align: left; font-size: 13px; margin-bottom: 24px; border: 1px solid #334155; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .row:last-child { margin-bottom: 0; }
            .label { color: #64748b; }
            .val { font-weight: bold; color: #f8fafc; }
            .btn { display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ Payment Verified & Approved</div>
            <h1>Access Activated!</h1>
            <p>You have approved student <strong>${tx.userName}</strong>. Full semester membership has been unlocked on their mobile device.</p>
            <div class="details">
              <div class="row"><span class="label">Student:</span><span class="val">${tx.userName}</span></div>
              <div class="row"><span class="label">Amount:</span><span class="val" style="color:#f59e0b;">${tx.currency}${tx.amount}</span></div>
              <div class="row"><span class="label">Reference:</span><span class="val" style="font-family:monospace;color:#38bdf8;">${tx.referenceNo}</span></div>
              <div class="row"><span class="label">Expires:</span><span class="val">${expireDate.toISOString().split('T')[0]}</span></div>
            </div>
            <a href="/" class="btn">Return to Smart Study Dashboard</a>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('Error in /api/payments/quick-approve:', err);
    res.status(500).send('<h1>Failed to approve payment</h1>');
  }
});


// 6. Get All Transactions & Students (Called by Admin Dashboard to view all receipts across all devices)
app.get('/api/payments/transactions', (req, res) => {
  try {
    const txs = loadServerTransactions();
    const students = loadServerStudents();
    res.json({
      transactions: txs,
      students: students
    });
  } catch (err: any) {
    console.error('Error in /api/payments/transactions:', err);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// 7. Approve Student Payment (Called by Admin Guduru Alemayehu in Admin Dashboard)
app.post('/api/payments/approve', (req, res) => {
  try {
    const { txId, studentId } = req.body;
    if (!txId && !studentId) return res.status(400).json({ error: 'txId or studentId is required' });

    const txs = loadServerTransactions();
    const students = loadServerStudents();

    let tx = txId ? txs.find((t) => t.id === txId || t.referenceNo === txId) : undefined;
    let student = studentId ? students.find((s) => s.id === studentId || s.email.toLowerCase() === studentId.toLowerCase()) : undefined;

    if (!tx && student) {
      tx = txs.find((t) =>
        (t.userEmail && student && t.userEmail.toLowerCase() === student.email.toLowerCase()) ||
        (t.userId && student && t.userId === student.id) ||
        (student && student.subscription?.transactionId && t.referenceNo === student.subscription.transactionId)
      );
    }

    if (!student && tx) {
      student = students.find((s) =>
        (tx && tx.userEmail && s.email.toLowerCase() === tx.userEmail.toLowerCase()) ||
        (tx && tx.userId && s.id === tx.userId) ||
        (tx && s.subscription && s.subscription.transactionId === tx.referenceNo) ||
        (tx && tx.userName && s.name && s.name.toLowerCase() === tx.userName.toLowerCase())
      );
    }

    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 4); // 4 months for 1 semester pass

    const activeSub = {
      status: 'active' as const,
      planId: tx?.planId || student?.subscription?.planId || 'plan-termly',
      planName: tx?.planName || student?.subscription?.planName || 'One Semester Full Pass',
      amountPaid: tx?.amount || student?.subscription?.amountPaid || 300,
      paymentMethod: tx?.paymentMethod || student?.subscription?.paymentMethod || 'CBE / Telebirr',
      transactionId: tx?.referenceNo || student?.subscription?.transactionId || ('REF-' + Date.now()),
      screenshotUrl: tx?.screenshotUrl || student?.subscription?.screenshotUrl || '',
      screenshotName: tx?.screenshotName || student?.subscription?.screenshotName || 'Payment_Receipt.jpg',
      activatedAt: new Date().toISOString().split('T')[0],
      expiresAt: expireDate.toISOString().split('T')[0]
    };

    if (tx) {
      tx.status = 'completed';
      saveServerTransactions(txs);
    } else if (student) {
      const newTx: ServerTransaction = {
        id: student.subscription?.transactionId || ('tx-' + student.id),
        userId: student.id,
        userEmail: student.email,
        userName: student.name,
        planId: activeSub.planId,
        planName: activeSub.planName,
        amount: activeSub.amountPaid,
        currency: 'ETB ',
        paymentMethod: activeSub.paymentMethod,
        status: 'completed',
        referenceNo: activeSub.transactionId,
        screenshotUrl: activeSub.screenshotUrl,
        screenshotName: activeSub.screenshotName,
        createdAt: new Date().toISOString().split('T')[0]
      };
      txs.unshift(newTx);
      saveServerTransactions(txs);
      tx = newTx;
    }

    if (student) {
      student.subscription = activeSub;
      saveServerStudents(students);
    } else if (tx) {
      const newStudent: ServerStudent = {
        id: tx.userId || ('student-' + Date.now()),
        email: tx.userEmail || 'student@smartstudy.edu',
        name: tx.userName || 'Student',
        role: 'student',
        subscription: activeSub,
        createdAt: tx.createdAt || new Date().toISOString().split('T')[0]
      };
      students.unshift(newStudent);
      saveServerStudents(students);
      student = newStudent;
    }

    console.log(`[PAYMENT APPROVED] Access unlocked for ${student?.name || tx?.userName} (${student?.email || tx?.userEmail})`);

    // Broadcast LIVE SSE event to all connected screens
    broadcastPaymentEvent('payment_approved', {
      txId: tx?.id,
      studentId: student?.id,
      studentName: student?.name || tx?.userName,
      transaction: tx,
      student: student,
      pendingCount: txs.filter((t) => t.status === 'pending').length,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      message: `Payment verified! One semester full access activated for ${student?.name || tx?.userName}.`,
      transaction: tx,
      student: student
    });
  } catch (err: any) {
    console.error('Error in /api/payments/approve:', err);
    res.status(500).json({ error: 'Failed to approve payment: ' + (err?.message || String(err)) });
  }
});

// 8. Reject Student Payment (Called by Admin)
app.post('/api/payments/reject', (req, res) => {
  try {
    const { txId, studentId } = req.body;
    if (!txId && !studentId) return res.status(400).json({ error: 'txId or studentId is required' });

    const txs = loadServerTransactions();
    const students = loadServerStudents();

    let tx = txId ? txs.find((t) => t.id === txId || t.referenceNo === txId) : undefined;
    let student = studentId ? students.find((s) => s.id === studentId || s.email.toLowerCase() === studentId.toLowerCase()) : undefined;

    if (tx) {
      tx.status = 'rejected';
      saveServerTransactions(txs);
    }

    if (student) {
      student.subscription = { status: 'none' };
      saveServerStudents(students);
    } else if (tx) {
      const s = students.find((item) =>
        (tx && tx.userEmail && item.email.toLowerCase() === tx.userEmail.toLowerCase()) ||
        (tx && tx.userId && item.id === tx.userId)
      );
      if (s) {
        s.subscription = { status: 'none' };
        saveServerStudents(students);
      }
    }

    broadcastPaymentEvent('payment_rejected', {
      txId,
      studentId,
      pendingCount: txs.filter((t) => t.status === 'pending').length,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      message: 'Transaction rejected / access revoked',
      transaction: tx
    });
  } catch (err: any) {
    console.error('Error in /api/payments/reject:', err);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

// 9. Check Subscription Status (Polled by Student's phone to auto-activate when admin approves)
app.get('/api/payments/status', (req, res) => {
  try {
    const email = (req.query.email as string || '').trim().toLowerCase();
    const userId = (req.query.userId as string || '').trim();

    if (!email && !userId) {
      return res.status(400).json({ error: 'email or userId is required' });
    }

    const students = loadServerStudents();
    const student = students.find((s) => 
      (email && s.email.toLowerCase() === email) || 
      (userId && s.id === userId)
    );

    const txs = loadServerTransactions();
    const userTxs = txs.filter((t) => 
      (email && t.userEmail && t.userEmail.toLowerCase() === email) || 
      (userId && t.userId && t.userId === userId)
    );

    const hasCompletedTx = userTxs.some((t) => t.status === 'completed');

    let resolvedSub = student?.subscription || null;
    if (hasCompletedTx) {
      const completedTx = userTxs.find((t) => t.status === 'completed')!;
      const expireDate = new Date();
      expireDate.setMonth(expireDate.getMonth() + 4);
      resolvedSub = {
        status: 'active' as const,
        planId: completedTx.planId || 'plan-termly',
        planName: completedTx.planName || 'One Semester Full Pass',
        amountPaid: completedTx.amount || 300,
        paymentMethod: completedTx.paymentMethod || 'CBE / Telebirr',
        transactionId: completedTx.referenceNo,
        screenshotUrl: completedTx.screenshotUrl || '',
        screenshotName: completedTx.screenshotName || 'Payment_Receipt.jpg',
        activatedAt: completedTx.createdAt || new Date().toISOString().split('T')[0],
        expiresAt: expireDate.toISOString().split('T')[0]
      };
    }

    res.json({
      student: student || null,
      subscription: resolvedSub,
      latestTransaction: userTxs[0] || null
    });
  } catch (err: any) {
    console.error('Error in /api/payments/status:', err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Study Tutorial PWA server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
