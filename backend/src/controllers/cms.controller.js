import CmsPage from '../models/CmsPage.js';
import CmsFaq from '../models/CmsFaq.js';
import CmsBanner from '../models/CmsBanner.js';
import { seedCmsDefaults } from '../services/cms.service.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

// ══════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (no auth needed — used by frontend)
// ══════════════════════════════════════════════════════

export const publicGetPage = async (req, res) => {
  try {
    await seedCmsDefaults();
    const page = await CmsPage.findOne({ slug: req.params.slug, is_published: true }).lean();
    if (!page) return res.status(404).json({ detail: 'Page not found' });
    res.json({ page });
  } catch (err) {
    logger.error('publicGetPage error:', err);
    res.status(500).json({ detail: 'Page load nahi ho saka' });
  }
};

export const publicGetFaqs = async (req, res) => {
  try {
    await seedCmsDefaults();
    const { category } = req.query;
    const query = { is_published: true };
    if (category) query.category = category;
    const faqs = await CmsFaq.find(query).sort({ category: 1, order: 1 }).lean();
    // Group by category
    const grouped = {};
    for (const f of faqs) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    }
    res.json({ faqs, grouped });
  } catch (err) {
    res.status(500).json({ detail: 'FAQs load nahi ho sake' });
  }
};

export const publicGetBanners = async (req, res) => {
  try {
    const { position } = req.query;
    const now = new Date();
    const query = {
      is_published: true,
      $or: [{ starts_at: { $lte: now } }, { starts_at: null }],
      $and: [{ $or: [{ ends_at: { $gte: now } }, { ends_at: null }] }],
    };
    if (position) query.position = position;
    const banners = await CmsBanner.find(query).sort({ position: 1, order: 1 }).lean();
    res.json({ banners });
  } catch (err) {
    res.status(500).json({ detail: 'Banners load nahi ho sake' });
  }
};

// ══════════════════════════════════════════════════════
// ADMIN — PAGES
// ══════════════════════════════════════════════════════

export const adminListPages = async (req, res) => {
  await seedCmsDefaults();
  const pages = await CmsPage.find().sort({ is_system: -1, title: 1 }).lean();
  res.json({ pages });
};

export const adminGetPage = async (req, res) => {
  const page = await CmsPage.findOne({ slug: req.params.slug }).lean();
  if (!page) return res.status(404).json({ detail: 'Page not found' });
  res.json({ page });
};

export const adminCreatePage = async (req, res) => {
  try {
    const { slug, title, content, meta_title, meta_description, is_published } = req.body;
    if (!slug || !title) return res.status(400).json({ detail: 'slug and title required' });
    const exists = await CmsPage.findOne({ slug: slug.toLowerCase() });
    if (exists) return res.status(409).json({ detail: 'Page with this slug already exists' });

    const page = await CmsPage.create({
      slug: slug.toLowerCase().replace(/\s+/g, '-'),
      title,
      content: content || '',
      meta_title,
      meta_description,
      is_published: is_published !== false,
      last_edited_by: req.user.email,
    });
    await recordAuditLog({ req, action: 'cms_page.create', resource: 'CmsPage', resource_id: page.slug, new_value: { title, slug } });
    res.status(201).json({ page });
  } catch (err) {
    logger.error('adminCreatePage error:', err);
    res.status(500).json({ detail: 'Page create nahi hua' });
  }
};

export const adminUpdatePage = async (req, res) => {
  try {
    const page = await CmsPage.findOne({ slug: req.params.slug });
    if (!page) return res.status(404).json({ detail: 'Page not found' });

    const old_value = { title: page.title, is_published: page.is_published };
    const { title, content, meta_title, meta_description, is_published } = req.body;

    if (title !== undefined) page.title = title;
    if (content !== undefined) page.content = content;
    if (meta_title !== undefined) page.meta_title = meta_title;
    if (meta_description !== undefined) page.meta_description = meta_description;
    if (is_published !== undefined) page.is_published = is_published;
    page.last_edited_by = req.user.email;
    await page.save();

    await recordAuditLog({ req, action: 'cms_page.update', resource: 'CmsPage', resource_id: page.slug, old_value, new_value: { title: page.title, is_published: page.is_published } });
    res.json({ page });
  } catch (err) {
    res.status(500).json({ detail: 'Page update nahi hua' });
  }
};

export const adminDeletePage = async (req, res) => {
  const page = await CmsPage.findOne({ slug: req.params.slug });
  if (!page) return res.status(404).json({ detail: 'Page not found' });
  if (page.is_system) return res.status(403).json({ detail: 'System pages cannot be deleted. Unpublish them instead.' });
  await page.deleteOne();
  await recordAuditLog({ req, action: 'cms_page.delete', resource: 'CmsPage', resource_id: page.slug, old_value: { title: page.title } });
  res.json({ message: 'Page deleted' });
};

// ══════════════════════════════════════════════════════
// ADMIN — FAQs
// ══════════════════════════════════════════════════════

export const adminListFaqs = async (req, res) => {
  await seedCmsDefaults();
  const faqs = await CmsFaq.find().sort({ category: 1, order: 1 }).lean();
  res.json({ faqs });
};

export const adminCreateFaq = async (req, res) => {
  try {
    const { question, answer, category, order, is_published } = req.body;
    if (!question || !answer) return res.status(400).json({ detail: 'question and answer required' });
    const faq = await CmsFaq.create({ question, answer, category: category || 'General', order: order || 0, is_published: is_published !== false });
    await recordAuditLog({ req, action: 'cms_faq.create', resource: 'CmsFaq', resource_id: faq._id.toString(), new_value: { question } });
    res.status(201).json({ faq });
  } catch (err) {
    res.status(500).json({ detail: 'FAQ create nahi hua' });
  }
};

export const adminUpdateFaq = async (req, res) => {
  try {
    const faq = await CmsFaq.findById(req.params.id);
    if (!faq) return res.status(404).json({ detail: 'FAQ not found' });
    const { question, answer, category, order, is_published } = req.body;
    if (question !== undefined) faq.question = question;
    if (answer !== undefined) faq.answer = answer;
    if (category !== undefined) faq.category = category;
    if (order !== undefined) faq.order = order;
    if (is_published !== undefined) faq.is_published = is_published;
    await faq.save();
    await recordAuditLog({ req, action: 'cms_faq.update', resource: 'CmsFaq', resource_id: faq._id.toString() });
    res.json({ faq });
  } catch (err) {
    res.status(500).json({ detail: 'FAQ update nahi hua' });
  }
};

export const adminDeleteFaq = async (req, res) => {
  const faq = await CmsFaq.findByIdAndDelete(req.params.id);
  if (!faq) return res.status(404).json({ detail: 'FAQ not found' });
  await recordAuditLog({ req, action: 'cms_faq.delete', resource: 'CmsFaq', resource_id: req.params.id });
  res.json({ message: 'FAQ deleted' });
};

// ══════════════════════════════════════════════════════
// ADMIN — BANNERS
// ══════════════════════════════════════════════════════

export const adminListBanners = async (req, res) => {
  const banners = await CmsBanner.find().sort({ position: 1, order: 1 }).lean();
  res.json({ banners });
};

export const adminCreateBanner = async (req, res) => {
  try {
    const { title, subtitle, image_url, cta_text, cta_link, position, order, is_published, starts_at, ends_at } = req.body;
    if (!title) return res.status(400).json({ detail: 'title required' });
    const banner = await CmsBanner.create({ title, subtitle, image_url, cta_text, cta_link, position, order: order || 0, is_published: is_published !== false, starts_at, ends_at });
    await recordAuditLog({ req, action: 'cms_banner.create', resource: 'CmsBanner', resource_id: banner._id.toString(), new_value: { title, position } });
    res.status(201).json({ banner });
  } catch (err) {
    res.status(500).json({ detail: 'Banner create nahi hua' });
  }
};

export const adminUpdateBanner = async (req, res) => {
  try {
    const banner = await CmsBanner.findById(req.params.id);
    if (!banner) return res.status(404).json({ detail: 'Banner not found' });
    const fields = ['title', 'subtitle', 'image_url', 'cta_text', 'cta_link', 'position', 'order', 'is_published', 'starts_at', 'ends_at'];
    for (const f of fields) { if (req.body[f] !== undefined) banner[f] = req.body[f]; }
    await banner.save();
    await recordAuditLog({ req, action: 'cms_banner.update', resource: 'CmsBanner', resource_id: banner._id.toString() });
    res.json({ banner });
  } catch (err) {
    res.status(500).json({ detail: 'Banner update nahi hua' });
  }
};

export const adminDeleteBanner = async (req, res) => {
  const banner = await CmsBanner.findByIdAndDelete(req.params.id);
  if (!banner) return res.status(404).json({ detail: 'Banner not found' });
  await recordAuditLog({ req, action: 'cms_banner.delete', resource: 'CmsBanner', resource_id: req.params.id });
  res.json({ message: 'Banner deleted' });
};

export default {
  publicGetPage, publicGetFaqs, publicGetBanners,
  adminListPages, adminGetPage, adminCreatePage, adminUpdatePage, adminDeletePage,
  adminListFaqs, adminCreateFaq, adminUpdateFaq, adminDeleteFaq,
  adminListBanners, adminCreateBanner, adminUpdateBanner, adminDeleteBanner,
};
