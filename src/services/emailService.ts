import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false, 
  },
});

function baseTemplate(content: string): string {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
      body { margin:0; padding:0; background:#f4f6f0; font-family: 'Segoe UI', Arial, sans-serif; }
      .wrapper { max-width:600px; margin:32px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.07); }
      .header { background:linear-gradient(135deg,#2d6a35,#a8d832); padding:32px 40px; text-align:center; }
      .header h1 { margin:0; color:#fff; font-size:26px; font-weight:800; letter-spacing:-0.5px; }
      .header p { margin:6px 0 0; color:rgba(255,255,255,0.85); font-size:14px; }
      .body { padding:36px 40px; }
      .tag { display:inline-block; background:#f2f9e4; color:#2d6a35; border-radius:20px; padding:4px 14px; font-size:12px; font-weight:700; margin-bottom:18px; }
      h2 { margin:0 0 10px; color:#1a2e1c; font-size:22px; font-weight:800; }
      p { margin:0 0 16px; color:#4a5c4d; font-size:15px; line-height:1.6; }
      .card { background:#f7f9f4; border:1px solid #e2ecd6; border-radius:12px; padding:20px 24px; margin:20px 0; }
      .card-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #e8eed8; }
      .card-row:last-child { border-bottom:none; }
      .card-label { color:#6b7f6e; font-size:13px; font-weight:600; }
      .card-value { color:#1a2e1c; font-size:13px; font-weight:700; }
      .highlight { background:#f2f9e4; border:2px solid #a8d832; border-radius:12px; padding:16px 20px; margin:20px 0; text-align:center; }
      .highlight p { margin:0; color:#2d6a35; font-weight:700; font-size:15px; }
      .contact-box { background:#fff8e6; border:1px solid #f0d080; border-radius:12px; padding:18px 22px; margin:20px 0; }
      .contact-box p { margin:0 0 6px; color:#7a5c00; font-size:14px; }
      .contact-box .contact-name { font-size:17px; font-weight:800; color:#3d2e00; margin:0; }
      .footer { background:#f4f6f0; padding:20px 40px; text-align:center; }
      .footer p { margin:0; color:#9ead9f; font-size:12px; }
      .footer strong { color:#2d6a35; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header">
        <h1>🌱 AgroFlow+</h1>
        <p>Connecting farmers, buyers & sellers across Akure</p>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        <p>© 2026 <strong>AgroFlow+</strong> · Akure, Ondo State, Nigeria</p>
        <p style="margin-top:4px">This is an automated notification. Do not reply to this email.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

// ── MATCH EMAIL TO BUYER ──────────────────────────────────────
export async function sendMatchEmailToBuyer(data: {
  buyerName: string;
  buyerEmail: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone?: string;
  cropType: string;
  quantity: number;
  sellerLocation: string;
  buyerLocation: string;
  distance: number;
  matchId: string;
}) {
  const content = `
    <span class="tag">🎉 Match Found!</span>
    <h2>Great news, ${data.buyerName}!</h2>
    <p>We found a seller for your produce request on AgroFlow+. Here are the details of your match:</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Crop</span>
        <span class="card-value"> ${data.cropType}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Quantity</span>
        <span class="card-value"> ${data.quantity} kg</span>
      </div>
      <div class="card-row">
        <span class="card-label">Seller Location</span>
        <span class="card-value"> ${data.sellerLocation}, Akure</span>
      </div>
      <div class="card-row">
        <span class="card-label">Your Location</span>
        <span class="card-value"> ${data.buyerLocation}, Akure</span>
      </div>
      <div class="card-row">
        <span class="card-label">Distance</span>
        <span class="card-value">~${data.distance} km apart</span>
      </div>
    </div>

    <div class="contact-box">
      <p>Your matched seller:</p>
      <p class="contact-name">${data.sellerName}</p>
      <p style="margin-top:6px">📧 ${data.sellerEmail}${data.sellerPhone ? `<br>📞 ${data.sellerPhone}` : ""}</p>
    </div>

    <div class="highlight">
      <p>👆 Reach out to your seller directly to arrange pickup in Akure.</p>
    </div>

    <p>Log in to AgroFlow+ to view your full match details, accept or decline this match.</p>
  `;
  await transporter.sendMail({
    from: `"AgroFlow+ Marketplace" <${process.env.GMAIL_USER}>`,
    to: data.buyerEmail,
    subject: `🌽 Match Found! ${data.quantity}kg of ${data.cropType} available near you in Akure`,
    html: baseTemplate(content),
  });
}

// ── MATCH EMAIL TO SELLER ──────────────────────────────────────
export async function sendMatchEmailToSeller(data: {
  sellerName: string;
  sellerEmail: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  cropType: string;
  quantity: number;
  buyerLocation: string;
  sellerLocation: string;
  distance: number;
  matchId: string;
}) {
  const content = `
    <span class="tag">🤝 New Match!</span>
    <h2>You've been matched, ${data.sellerName}!</h2>
    <p>A buyer on AgroFlow+ has been matched to your produce listing. Here are the details:</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Crop</span>
        <span class="card-value">${data.cropType}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Quantity Requested</span>
        <span class="card-value">${data.quantity} kg</span>
      </div>
      <div class="card-row">
        <span class="card-label">Buyer Location</span>
        <span class="card-value">📍 ${data.buyerLocation}, Akure</span>
      </div>
      <div class="card-row">
        <span class="card-label">Your Location</span>
        <span class="card-value">📍 ${data.sellerLocation}, Akure</span>
      </div>
      <div class="card-row">
        <span class="card-label">Distance</span>
        <span class="card-value">~${data.distance} km apart</span>
      </div>
    </div>

    <div class="contact-box">
      <p>Your matched buyer:</p>
      <p class="contact-name">${data.buyerName}</p>
      <p style="margin-top:6px">📧 ${data.buyerEmail}${data.buyerPhone ? `<br>📞 ${data.buyerPhone}` : ""}</p>
    </div>

    <div class="highlight">
      <p>👆 Contact your buyer directly to arrange pickup in Akure.</p>
    </div>

    <p>Log in to AgroFlow+ to accept or decline this match and view full details.</p>
  `;
  await transporter.sendMail({
    from: `"AgroFlow+ Marketplace" <${process.env.GMAIL_USER}>`,
    to: data.sellerEmail,
    subject: `🛒 New Buyer Matched! Someone wants ${data.quantity}kg of your ${data.cropType}`,
    html: baseTemplate(content),
  });
}

// ── WAITLIST EMAIL ──────────────────────────────────────
export async function sendWaitlistEmail(data: {
  buyerName: string;
  buyerEmail: string;
  cropType: string;
  quantity: number;
  location: string;
}) {
  const content = `
    <span class="tag">⏳ Added to Waitlist</span>
    <h2>You're on the waitlist, ${data.buyerName}!</h2>
    <p>No sellers are currently available for your request, but don't worry — we've added you to the waitlist and will notify you the moment a match is found.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Crop Needed</span>
        <span class="card-value">${data.cropType}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Quantity</span>
        <span class="card-value">${data.quantity} kg</span>
      </div>
      <div class="card-row">
        <span class="card-label">Your Location</span>
        <span class="card-value">📍 ${data.location}, Akure</span>
      </div>
    </div>

    <div class="highlight">
      <p>We'll email you immediately when a seller posts matching produce near you.</p>
    </div>

    <p>You can also browse the AgroFlow+ marketplace manually and send a request directly to any available seller.</p>
  `;
  await transporter.sendMail({
    from: `"AgroFlow+ Marketplace" <${process.env.GMAIL_USER}>`,
    to: data.buyerEmail,
    subject: `⏳ Waitlist Confirmed — We'll find you ${data.cropType} in Akure`,
    html: baseTemplate(content),
  });
}

// ── REQUEST NOTIFICATION EMAIL TO SELLER ──────────────────────────────────────
export async function sendRequestEmailToSeller(data: {
  sellerName: string;
  sellerEmail: string;
  buyerName: string;
  buyerEmail: string;
  cropType: string;
  quantity: number;
  message?: string;
}) {
  const content = `
    <span class="tag">📬 New Request</span>
    <h2>New purchase request, ${data.sellerName}!</h2>
    <p>A buyer on AgroFlow+ wants to purchase your produce. Log in to accept or decline.</p>

    <div class="card">
      <div class="card-row">
        <span class="card-label">Buyer</span>
        <span class="card-value">${data.buyerName}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Crop</span>
        <span class="card-value">${data.cropType}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Quantity</span>
        <span class="card-value">${data.quantity} kg</span>
      </div>
      ${
        data.message
          ? `
      <div class="card-row">
        <span class="card-label">Message</span>
        <span class="card-value">"${data.message}"</span>
      </div>`
          : ""
      }
    </div>

    <div class="highlight">
      <p>Log in to AgroFlow+ to accept or decline this request.</p>
    </div>
  `;
  await transporter.sendMail({
    from: `"AgroFlow+ Marketplace" <${process.env.GMAIL_USER}>`,
    to: data.sellerEmail,
    subject: `📬 New Request: ${data.buyerName} wants ${data.quantity}kg of your ${data.cropType}`,
    html: baseTemplate(content),
  });
}