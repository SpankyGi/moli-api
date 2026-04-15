import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:8080,http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("CORS"));
  },
  methods: ["POST", "OPTIONS"],
}));
app.use(express.json({ limit: "10kb" }));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const smtpReady =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS;

let transporter = null;
if (smtpReady) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function validate(body) {
  const errors = [];
  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 100)
    errors.push("name");
  if (!body.event || typeof body.event !== "string" || body.event.trim().length < 2 || body.event.length > 100)
    errors.push("event");
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
    errors.push("email");
  if (body.phone && (typeof body.phone !== "string" || body.phone.length > 20))
    errors.push("phone");
  if (body.message && body.message.length > 1000)
    errors.push("message");
  if (body.guests && String(body.guests).length > 20)
    errors.push("guests");
  if (body.date && String(body.date).length > 50)
    errors.push("date");
  return errors;
}

app.post("/lead", async (req, res) => {
  try {
    if (req.body._hp) {
      return res.json({ ok: true, mode: "test" });
    }

    const errors = validate(req.body);
    if (errors.length) {
      return res.status(400).json({ ok: false, errors });
    }

    const lead = {
      name: req.body.name?.trim(),
      email: req.body.email?.trim() || "",
      phone: req.body.phone?.trim() || "",
      event: req.body.event?.trim(),
      date: req.body.date?.trim() || "",
      guests: req.body.guests?.trim() || "",
      message: req.body.message?.trim() || "",
      source: req.body.source || "catering",
      serviceType: req.body.serviceType || "",
      timestamp: new Date().toISOString(),
    };

    const leadsFile = path.join(dataDir, "leads.json");
    let leads = [];
    if (fs.existsSync(leadsFile)) {
      leads = JSON.parse(fs.readFileSync(leadsFile, "utf-8"));
    }
    leads.push(lead);
    fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
    console.log("[LEAD]", lead);

    if (transporter) {
      const mailTo = process.env.MAIL_TO || "catering@molidelescala.com";
      const mailFrom = process.env.MAIL_FROM || "web@molidelescala.com";

      await transporter.sendMail({
        from: mailFrom,
        to: mailTo,
        replyTo: lead.email || undefined,
        subject: `Nou lead càtering: ${lead.name} — ${lead.event}`,
        text: [
          `Nom: ${lead.name}`,
          `Email: ${lead.email}`,
          `Telèfon: ${lead.phone}`,
          `Esdeveniment: ${lead.event}`,
          `Data: ${lead.date}`,
          `Comensals: ${lead.guests}`,
          `Missatge: ${lead.message}`,
          `Font: ${lead.source}`,
          `Tipus servei: ${lead.serviceType}`,
          `Data envio: ${lead.timestamp}`,
        ].join("\n"),
      });

      return res.json({ ok: true, mode: "email" });
    }

    return res.json({ ok: true, mode: "test" });
  } catch (err) {
    console.error("[LEAD ERROR]", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", mode: smtpReady ? "email" : "test" });
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT} — mode: ${smtpReady ? "EMAIL" : "TEST (no SMTP)"}`);
});
