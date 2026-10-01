require('dotenv').config();

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const SITE_DIR = path.join(__dirname, '..', 'rcs-sito');
const PORT = process.env.PORT || 4000;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_FIELDS = ['ragione_sociale', 'referente', 'email', 'settore', 'messaggio'];

const SETTORE_LABELS = {
  'partnership-generale': 'Partnership generale',
  infrastrutture: 'Infrastrutture',
  'dighe-idroelettriche': 'Dighe idroelettriche',
  ponti: 'Ponti stradali e autostradali',
  agricoltura: 'Agricoltura',
  'energie-rinnovabili': 'Energie rinnovabili',
  'miniere-oro': "Miniere d'oro",
  carbone: 'Carbone',
  petrolifero: 'Settore petrolifero',
  ferroviario: 'Settore ferroviario',
  altro: 'Altro',
};

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Troppe richieste da questo indirizzo. Riprova più tardi.' },
});

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

app.post('/api/contatto', contactLimiter, async (req, res) => {
  const body = req.body || {};

  // Honeypot anti-spam: campo nascosto che un utente reale non compila mai.
  if (body.sito_web) {
    return res.json({ ok: true });
  }

  const missing = REQUIRED_FIELDS.filter((field) => !String(body[field] || '').trim());
  if (missing.length) {
    return res.status(400).json({ ok: false, error: `Campi mancanti: ${missing.join(', ')}` });
  }
  if (!EMAIL_RE.test(body.email)) {
    return res.status(400).json({ ok: false, error: 'Indirizzo email non valido.' });
  }
  if (!body.consent_privacy) {
    return res.status(400).json({ ok: false, error: 'È necessario il consenso al trattamento dei dati personali.' });
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.error('[contatto] SMTP non configurato: imposta le variabili SMTP_* in rcs-server/.env');
    return res.status(503).json({
      ok: false,
      error: 'Servizio email non ancora configurato sul server. Scrivi direttamente a info@rcsworld.eu.',
    });
  }

  const settoreLabel = SETTORE_LABELS[body.settore] || body.settore;
  const rows = [
    ['Ragione sociale', body.ragione_sociale],
    ['Referente', body.referente],
    ['Email', body.email],
    ['Telefono', body.telefono || '—'],
    ['Settore di interesse', settoreLabel],
  ];

  const textBody = [
    'Nuova richiesta dal sito RCS S.r.l.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Messaggio:',
    body.messaggio,
  ].join('\n');

  const htmlBody = `
    <h2 style="font-family:sans-serif">Nuova richiesta dal sito RCS S.r.l.</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      ${rows.map(([label, value]) => `<tr><td><b>${escapeHtml(label)}</b></td><td>${escapeHtml(value)}</td></tr>`).join('')}
    </table>
    <p style="font-family:sans-serif"><b>Messaggio:</b></p>
    <p style="font-family:sans-serif">${escapeHtml(body.messaggio).replace(/\n/g, '<br>')}</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: process.env.MAIL_TO || 'info@rcsworld.eu',
      replyTo: body.email,
      subject: `Nuova richiesta dal sito — ${body.ragione_sociale}`,
      text: textBody,
      html: htmlBody,
    });

    // Email di conferma al richiedente: "best effort", non blocca la risposta se fallisce.
    transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: body.email,
      subject: 'Abbiamo ricevuto la tua richiesta — RCS S.r.l.',
      text: `Gentile ${body.referente},\n\nGrazie per aver contattato RCS S.r.l. Abbiamo ricevuto la tua richiesta (settore: ${settoreLabel}) e ti risponderemo al più presto.\n\nRCS S.r.l.\ninfo@rcsworld.eu`,
    }).catch((err) => console.error('[contatto] invio email di conferma non riuscito:', err.message));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[contatto] invio email non riuscito:', err);
    return res.status(502).json({
      ok: false,
      error: 'Invio non riuscito. Riprova più tardi o scrivi a info@rcsworld.eu.',
    });
  }
});

app.use(express.static(SITE_DIR));

app.use((req, res) => {
  res.status(404).send('Pagina non trovata.');
});

app.listen(PORT, () => {
  console.log(`Sito RCS S.r.l. disponibile su http://localhost:${PORT}`);
});
