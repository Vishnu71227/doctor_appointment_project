import CmsPage from '../models/CmsPage.js';
import CmsFaq from '../models/CmsFaq.js';
import CmsBanner from '../models/CmsBanner.js';
import logger from '../utils/logger.js';

// ── Default system pages ───────────────────────────────────────────────────
const DEFAULT_PAGES = [
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    is_system: true,
    is_published: true,
    content: `<h2>Privacy Policy</h2>
<p>Last updated: ${new Date().toLocaleDateString('en-IN')}</p>
<p>HealthLine ("we", "our", "us") respects your privacy. This policy explains how we collect, use, and protect your personal data when you use our telemedicine platform.</p>
<h3>1. Information We Collect</h3>
<ul>
  <li>Personal identification (name, email, phone)</li>
  <li>Medical history and consultation records</li>
  <li>Payment information (processed securely via Razorpay)</li>
  <li>Device and usage data for improving our services</li>
</ul>
<h3>2. How We Use Your Data</h3>
<ul>
  <li>To provide telemedicine consultations</li>
  <li>To send appointment reminders and health updates</li>
  <li>To process payments and issue invoices</li>
  <li>To improve platform experience</li>
</ul>
<h3>3. Data Security</h3>
<p>We use industry-standard encryption and security measures to protect your data. Medical records are stored securely and accessed only by authorized personnel.</p>
<h3>4. Your Rights</h3>
<p>You may request access, correction, or deletion of your personal data by contacting us at support@healthline.com.</p>
<h3>5. Contact Us</h3>
<p>For any privacy-related questions, contact: support@healthline.com</p>`,
  },
  {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    is_system: true,
    is_published: true,
    content: `<h2>Terms & Conditions</h2>
<p>Last updated: ${new Date().toLocaleDateString('en-IN')}</p>
<p>By using HealthLine, you agree to the following terms and conditions.</p>
<h3>1. Service Description</h3>
<p>HealthLine provides an online telemedicine platform connecting patients with licensed doctors for video consultations, prescriptions, and medical advice.</p>
<h3>2. User Responsibilities</h3>
<ul>
  <li>Provide accurate personal and medical information</li>
  <li>Use the platform only for legitimate medical purposes</li>
  <li>Not share your account credentials with others</li>
</ul>
<h3>3. Medical Disclaimer</h3>
<p>HealthLine is not a substitute for emergency medical care. In case of emergency, please contact 112 or visit the nearest hospital immediately.</p>
<h3>4. Payment Terms</h3>
<p>All consultation fees are collected at the time of booking. Refunds are subject to our refund policy.</p>
<h3>5. Governing Law</h3>
<p>These terms are governed by the laws of India.</p>`,
  },
  {
    slug: 'about-us',
    title: 'About Us',
    is_system: true,
    is_published: true,
    content: `<h2>About HealthLine</h2>
<p>HealthLine is a modern telemedicine platform built to make quality healthcare accessible to everyone in India.</p>
<h3>Our Mission</h3>
<p>To bridge the gap between patients and healthcare providers through technology, making expert medical consultations available at your fingertips — anytime, anywhere.</p>
<h3>What We Offer</h3>
<ul>
  <li>Video consultations with verified doctors</li>
  <li>Digital prescriptions</li>
  <li>Appointment scheduling</li>
  <li>Medical record management</li>
</ul>
<h3>Our Doctors</h3>
<p>All doctors on HealthLine are verified, licensed medical professionals with proven experience in their specializations.</p>`,
  },
  {
    slug: 'contact-us',
    title: 'Contact Us',
    is_system: true,
    is_published: true,
    content: `<h2>Contact Us</h2>
<p>We'd love to hear from you. Reach us through any of the following:</p>
<ul>
  <li><strong>Email:</strong> support@healthline.com</li>
  <li><strong>Phone:</strong> +91-XXXXXXXXXX</li>
  <li><strong>Hours:</strong> Mon–Sat, 9 AM – 6 PM IST</li>
</ul>
<p>For medical emergencies, please dial <strong>112</strong>.</p>`,
  },
];

// ── Default FAQs ───────────────────────────────────────────────────────────
const DEFAULT_FAQS = [
  { question: 'How do I book a consultation?', answer: 'Go to the Find Doctors page, select a doctor and click Book Appointment.', category: 'Booking', order: 1 },
  { question: 'Are the doctors verified?', answer: 'Yes. All doctors on HealthLine are verified with valid medical licenses.', category: 'Doctors', order: 1 },
  { question: 'How does the video consultation work?', answer: 'After booking, you will receive a video call link. Join at the scheduled time from any device.', category: 'Consultation', order: 1 },
  { question: 'Can I get a digital prescription?', answer: 'Yes. After the consultation, the doctor can issue a digital prescription directly on the platform.', category: 'Prescription', order: 1 },
  { question: 'What payment methods are accepted?', answer: 'We accept UPI, credit/debit cards, net banking and wallets via Razorpay.', category: 'Payment', order: 1 },
  { question: 'What is the refund policy?', answer: 'Cancellations made 24 hours before the appointment are eligible for a full refund. Contact support for exceptions.', category: 'Payment', order: 2 },
];

let _seeded = false;

export const seedCmsDefaults = async () => {
  if (_seeded) return;
  try {
    await Promise.all([
      ...DEFAULT_PAGES.map((p) =>
        CmsPage.findOneAndUpdate({ slug: p.slug }, { $setOnInsert: p }, { upsert: true, new: true })
      ),
      ...DEFAULT_FAQS.map((f) =>
        CmsFaq.findOneAndUpdate({ question: f.question }, { $setOnInsert: f }, { upsert: true, new: true })
      ),
    ]);
    _seeded = true;
    logger.info('[CMS] Defaults seeded/verified');
  } catch (err) {
    logger.error('[CMS] Seed error:', err);
  }
};

export default { seedCmsDefaults };
